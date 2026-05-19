import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { anthropic, CLAUDE_MODEL, buildSystemPrompt, structuredAICall } from '../lib/claude.js';
import { supabase } from '../lib/supabase.js';
import { calcEmotionalScore, rateTransaction } from '../lib/spendingScore.js';

const router = Router();

// All AI routes require authentication
router.use(requireAuth);

// ─── Helper: fetch user profile for system prompt context ─────────────────────
async function getUserProfile(userId) {
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data || {};
}

// ─── POST /api/ai/personality ─────────────────────────────────────────────────
// Takes the user's onboarding answers + 60-day transactions and returns a
// Financial Personality type with a detailed description.
router.post('/personality', async (req, res) => {
  try {
    const { answers, transactions } = req.body;

    const systemPrompt = `You are MoodMoney's personality engine. Analyze a user's spending data and questionnaire answers to assign them one Financial Personality type.

The 7 personality types:
1. Emotional Spender — spends to cope with stress, anxiety, or sadness
2. Chaos Buyer — impulsive, disorganized, purchases without planning
3. Safe Saver — avoids risk, hoards money, struggles to enjoy spending
4. Dopamine Shopper — gets a high from buying, addicted to the thrill
5. Future Builder — disciplined, goal-oriented, delayed gratification
6. Status Spender — buys for social proof, brand-conscious, image-driven
7. Fearful Investor — avoids investing, keeps cash out of fear

Respond with ONLY valid JSON matching this exact schema:
{
  "type": "<one of the 7 types>",
  "emoji": "<single emoji representing the type>",
  "tagline": "<8-word punchy tagline>",
  "description": "<2-3 sentences explaining why this fits them>",
  "superpower": "<one positive trait of this personality>",
  "blindspot": "<one spending weakness to watch>",
  "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]
}`;

    const userMessage = `Questionnaire answers: ${JSON.stringify(answers)}

Recent transaction summary (last 60 days):
${JSON.stringify(transactions?.slice(0, 100), null, 2)}

Determine this user's Financial Personality type.`;

    const result = await structuredAICall(systemPrompt, userMessage);

    // Persist the personality type to their profile
    await supabase
      .from('user_profiles')
      .update({ personality_type: result.type, personality_data: result })
      .eq('id', req.user.id);

    res.json(result);
  } catch (err) {
    console.error('[/ai/personality]', err);
    res.status(500).json({ error: 'Failed to analyze personality' });
  }
});

// ─── POST /api/ai/analyze-spending ────────────────────────────────────────────
// Batch-analyzes 60 days of transactions and returns insight cards.
// The emotionalScore is computed DETERMINISTICALLY (pure math) so it never
// fluctuates between refreshes. Only the insight text comes from Claude.
router.post('/analyze-spending', async (req, res) => {
  try {
    const { transactions } = req.body;
    const profile = await getUserProfile(req.user.id);

    // ── 1. Deterministic emotional score — always stable ─────────────────────
    const emotionalScore = calcEmotionalScore(transactions);

    // ── 2. Per-transaction effectiveness ratings ──────────────────────────────
    const rated = (transactions || []).map(t => ({
      ...t,
      effectivenessScore: rateTransaction(t, transactions),
    }));

    // ── 3. AI generates insight text only (not the score) ─────────────────────
    const systemPrompt = buildSystemPrompt(profile) + `

Your task: analyze these transactions and produce behavioral spending insights.
Each insight must be specific (reference actual amounts), emotionally intelligent,
and actionable. The user's emotional spending score is already computed as ${emotionalScore}/100.

Respond with ONLY valid JSON:
{
  "insights": [
    {
      "id": "<unique string>",
      "category": "emotional|timing|habit|anomaly|achievement",
      "title": "<short bold headline, max 8 words>",
      "body": "<1-2 conversational sentences with specific data, max 25 words>",
      "icon": "<single relevant emoji>",
      "severity": "info|warning|critical",
      "amount": <number or null>,
      "actionPrompt": "<optional CTA question the user can ask the chat>",
      "badge": "<optional badge name if this is an achievement>"
    }
  ],
  "weeklyAverage": <number>,
  "topTrigger": "<string>"
}`;

    const userMessage = `Transactions (last 60 days):
${JSON.stringify(transactions?.slice(0, 60), null, 2)}

Generate exactly 5 insight cards. Return only valid JSON, no extra text.`;

    const aiResult = await structuredAICall(systemPrompt, userMessage);

    // ── 4. Merge deterministic score into result ──────────────────────────────
    const result = {
      ...aiResult,
      emotionalScore,          // always from math, never from AI
      ratedTransactions: rated, // every txn with its effectivenessScore
    };

    // ── 5. Cache so dashboard loads instantly ─────────────────────────────────
    await supabase
      .from('spending_analyses')
      .upsert({
        user_id: req.user.id,
        analysis: result,
        analyzed_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    res.json(result);
  } catch (err) {
    console.error('[/ai/analyze-spending]', err);
    res.status(500).json({ error: 'Failed to analyze spending' });
  }
});

// ─── POST /api/ai/afford-this ─────────────────────────────────────────────────
// Calculates whether the user can afford a purchase and returns a shareable card.
router.post('/afford-this', async (req, res) => {
  try {
    const { description, price, imageUrl } = req.body;
    const profile = await getUserProfile(req.user.id);

    // Fetch the user's recent spending context for accurate projections
    const { data: analysis } = await supabase
      .from('spending_analyses')
      .select('analysis')
      .eq('user_id', req.user.id)
      .single();

    const systemPrompt = `You are MoodMoney's affordability engine. Given a purchase, calculate its true cost and impact on the user's financial life.

Always respond with ONLY valid JSON matching this schema exactly:
{
  "budgetScore": <0-100, 100 = fully affordable, 0 = terrible idea>,
  "verdict": "green|yellow|red",
  "verdictLabel": "<3-4 word label like 'You can swing it' or 'Risky move'>",
  "headline": "<punchy one-liner about this purchase>",
  "goalDelay": { "days": <number>, "goalName": "<string>" },
  "opportunityCost5yr": <dollar amount this becomes if invested at 7% for 5 years>,
  "monthlyCashflowImpact": <how many months of current savings this represents>,
  "emotionalNote": "<one sentence about the emotional psychology of this purchase>",
  "alternatives": [
    { "name": "<alternative>", "price": <number>, "savings": <number> }
  ],
  "shareCaption": "<Instagram-worthy caption for sharing this result>"
}`;

    const userMessage = `Purchase to evaluate:
- Item: ${description}
- Price: $${price}

User's financial context:
- Personality type: ${profile.personality_type || 'unknown'}
- Weekly spending average: $${analysis?.analysis?.weeklyAverage || 'unknown'}
- Savings goal: ${profile.savings_goal || 'not set'}
- Monthly income: $${profile.monthly_income || 'unknown'}

Calculate the affordability score card.`;

    const result = await structuredAICall(systemPrompt, userMessage);

    res.json({ ...result, item: description, price: Number(price), imageUrl });
  } catch (err) {
    console.error('[/ai/afford-this]', err);
    res.status(500).json({ error: 'Failed to calculate affordability' });
  }
});

// ─── POST /api/ai/simulate ────────────────────────────────────────────────────
// Runs a "what if" financial simulation and returns projection data.
router.post('/simulate', async (req, res) => {
  try {
    const { scenario } = req.body; // e.g. "What if I cut food delivery by 30%?"
    const profile = await getUserProfile(req.user.id);

    const systemPrompt = `You are MoodMoney's financial simulation engine.

Respond with ONLY valid JSON:
{
  "scenarioTitle": "<clean restatement of the scenario>",
  "monthlySavings": <dollars saved per month>,
  "yearlySavings": <dollars saved per year>,
  "fiveYearProjection": <total with 7% investment returns>,
  "goalImpact": "<how this affects their stated goal>",
  "timeline": [
    { "label": "<time label e.g. '3 months'>", "value": <cumulative dollars>, "milestone": "<optional milestone name>" }
  ],
  "motivationalLine": "<one punchy motivational sentence about this change>",
  "difficulty": "easy|medium|hard",
  "firstStep": "<one concrete first action they can take today>"
}

Make the timeline have 6 data points spanning 6 months to 5 years.`;

    const userMessage = `Simulation scenario: "${scenario}"

User context:
- Personality: ${profile.personality_type || 'unknown'}
- Monthly income: $${profile.monthly_income || 'unknown'}
- Current savings: $${profile.current_savings || 0}
- Goal: ${profile.savings_goal || 'not set'}`;

    const result = await structuredAICall(systemPrompt, userMessage);
    res.json(result);
  } catch (err) {
    console.error('[/ai/simulate]', err);
    res.status(500).json({ error: 'Failed to run simulation' });
  }
});

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
// Conversational AI chat endpoint. Maintains multi-turn history.
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body; // Array of { role, content }
    const profile = await getUserProfile(req.user.id);

    // Fetch spending context to inject into system prompt
    const { data: analysis } = await supabase
      .from('spending_analyses')
      .select('analysis')
      .eq('user_id', req.user.id)
      .single();

    let systemPrompt = buildSystemPrompt(profile);

    if (analysis?.analysis) {
      systemPrompt += `\n\nLatest spending insights:\n${JSON.stringify(analysis.analysis.insights?.slice(0, 5), null, 2)}`;
      systemPrompt += `\nEmotional spending score: ${analysis.analysis.emotionalScore}/100`;
      systemPrompt += `\nTop spending trigger: ${analysis.analysis.topTrigger}`;
    }

    // Check free tier message limit (10/month)
    if (!profile.is_premium) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .gte('created_at', startOfMonth.toISOString());

      if (count >= 10) {
        return res.status(402).json({
          error: 'monthly_limit_reached',
          message: "You've used your 10 free AI messages this month. Upgrade to Premium for unlimited coaching.",
        });
      }
    }

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: messages.slice(-20), // Keep last 20 turns to stay within context
    });

    const assistantMessage = response.content[0].text;

    // Log message for free-tier counting
    await supabase.from('chat_messages').insert({
      user_id: req.user.id,
      role: 'assistant',
      content: assistantMessage,
    });

    res.json({ message: assistantMessage });
  } catch (err) {
    console.error('[/ai/chat]', err);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// ─── POST /api/ai/proactive-alerts ───────────────────────────────────────────
// Claude scans patterns and generates proactive risk alerts for the user.
router.post('/proactive-alerts', async (req, res) => {
  try {
    const { transactions } = req.body;
    const profile = await getUserProfile(req.user.id);

    const systemPrompt = `You are MoodMoney's proactive alert engine. Scan spending patterns and generate timely, relevant alerts.

Alerts must be:
- Specific to this user's actual data
- Forward-looking (warn about what might happen, not just what happened)
- Short enough to read as a push notification (under 15 words)

Respond with ONLY valid JSON:
{
  "alerts": [
    {
      "id": "<string>",
      "type": "risk|streak|anomaly|milestone",
      "message": "<push notification text>",
      "detail": "<one sentence of context>",
      "icon": "<emoji>",
      "urgency": "low|medium|high"
    }
  ]
}`;

    const userMessage = `Recent transactions (last 14 days):
${JSON.stringify(transactions?.slice(0, 50), null, 2)}

User personality: ${profile.personality_type}
Generate 2-4 proactive alerts for this user.`;

    const result = await structuredAICall(systemPrompt, userMessage);
    res.json(result);
  } catch (err) {
    console.error('[/ai/proactive-alerts]', err);
    res.status(500).json({ error: 'Failed to generate alerts' });
  }
});

// ─── POST /api/ai/savings-recommendation ─────────────────────────────────────
router.post('/savings-recommendation', async (req, res) => {
  try {
    const { transactions, goals } = req.body;
    const profile = await getUserProfile(req.user.id);

    const systemPrompt = `You are MoodMoney's savings coach. Analyze spending and recommend how much to save monthly per goal.

Respond with ONLY valid JSON:
{
  "totalRecommendedSavings": <monthly dollar amount>,
  "breakdown": [
    { "goalName": "<string>", "monthlyAmount": <number>, "reasoning": "<1 sentence>" }
  ],
  "quickWins": ["<spending cut>", "<spending cut>", "<spending cut>"],
  "savingsScore": <0-100>,
  "message": "<1-2 encouraging sentences>"
}`;

    const userMessage = `Transactions (last 30 days): ${JSON.stringify(transactions?.slice(0, 50))}
Savings goals: ${JSON.stringify(goals)}
Monthly income: $${profile.monthly_income || 'unknown'}
Give personalized savings recommendations.`;

    const result = await structuredAICall(systemPrompt, userMessage, 2, 1024);
    res.json(result);
  } catch (err) {
    console.error('[/ai/savings-recommendation]', err);
    res.status(500).json({ error: 'Failed to get savings recommendation' });
  }
});

// ─── POST /api/ai/weekly-recap ────────────────────────────────────────────────
router.post('/weekly-recap', async (req, res) => {
  try {
    const { transactions } = req.body;
    const profile = await getUserProfile(req.user.id);

    const systemPrompt = `You are MoodMoney's weekly recap engine. Create a fun "Spotify Wrapped" style spending recap.

Respond with ONLY valid JSON:
{
  "totalSpent": <number>,
  "topCategory": "<category name>",
  "topMerchant": "<merchant name>",
  "topMerchantAmount": <number>,
  "emotionalMoment": "<most interesting spending story this week, 1 sentence>",
  "winOfTheWeek": "<one positive thing they did>",
  "challengeOfTheWeek": "<one thing to improve>",
  "score": <0-100>,
  "grade": "A|B|C|D|F",
  "shareText": "<fun shareable 2-line summary>"
}`;

    const userMessage = `This week's transactions: ${JSON.stringify(transactions?.slice(0, 30))}
User personality: ${profile.personality_type || 'unknown'}
Monthly income: $${profile.monthly_income || 'unknown'}
Create the weekly recap.`;

    const result = await structuredAICall(systemPrompt, userMessage, 2, 1024);
    res.json(result);
  } catch (err) {
    console.error('[/ai/weekly-recap]', err);
    res.status(500).json({ error: 'Failed to generate recap' });
  }
});

export default router;
