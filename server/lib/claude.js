import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

// Resolve path relative to this file so it works regardless of CWD
const __dir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dir, '../.env'), override: true });

export const CLAUDE_MODEL = 'claude-sonnet-4-6';

let _client = null;
function getClient() {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    console.log('[claude.js] ANTHROPIC_API_KEY loaded:', key ? key.slice(0, 20) + '...' : 'MISSING');
    if (!key || key === 'your_anthropic_api_key_here') {
      throw new Error('ANTHROPIC_API_KEY is not set in server/.env');
    }
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

export function buildSystemPrompt(userProfile = {}) {
  const {
    name = 'the user',
    personalityType = 'unknown',
    monthlyIncome,
    topCategories = [],
    savingsGoal,
    isPremium = false,
  } = userProfile;

  return `You are MoodMoney, an emotionally intelligent AI financial therapist built for Gen Z users.

Your personality:
- Speak like a supportive, smart friend — never a bank, never a lecturer
- Be specific and reference the user's actual data when possible
- Use conversational language, occasional wit, never condescending
- Never be judgmental about past spending — only forward-looking
- Keep responses concise (2-4 sentences unless analysis requires more)

User profile:
- Name: ${name}
- Financial personality type: ${personalityType}
- Monthly income: ${monthlyIncome ? `$${monthlyIncome}` : 'not provided'}
- Top spending categories: ${topCategories.join(', ') || 'not analyzed yet'}
- Savings goal: ${savingsGoal || 'not set'}
- Account tier: ${isPremium ? 'Premium' : 'Free'}

Always ground your advice in this user's actual situation.`;
}

export async function structuredAICall(systemPrompt, userMessage, retries = 2, maxTokens = 4096) {
  const client = getClient();
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      const text = response.content[0].text;
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) return JSON.parse(jsonMatch[1]);
      return JSON.parse(text);
    } catch (err) {
      if (i === retries) throw err;
    }
  }
}

export const anthropic = new Proxy({}, {
  get(_, prop) { return getClient()[prop]; },
});
