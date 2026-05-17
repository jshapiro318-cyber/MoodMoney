import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { structuredAICall } from '../lib/claude.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

const FEATURED = [
  'AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','NFLX','UBER','LYFT',
  'PLTR','AMD','SOFI','COIN','RBLX','SNAP','SHOP','SQ','PYPL','DIS',
  'SPOT','HOOD','RIVN','NIO','GME','AMC','BABA','INTC','CRM','ORCL',
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

function sma(arr, n) {
  const slice = arr.slice(-n).filter(Boolean);
  if (!slice.length) return null;
  return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
}

// Fetch market data in staggered batches of 5 (avoids rate limiting)
async function fetchMarketBatch(symbols) {
  const BATCH = 5;
  const stocks = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(fetchSimple));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) stocks.push(r.value);
    }
    // Small stagger between batches to avoid rate limiting
    if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 120));
  }
  return stocks;
}

// Single stock via chart API — works during AND outside market hours
async function fetchSimple(symbol) {
  // Try query2 first, fall back to query1
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${symbol}?interval=1d&range=7d`,
        { headers: BROWSER_HEADERS, signal: ctrl.signal }
      );
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const meta   = result.meta;
      const closes = result.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
      const price  = meta.regularMarketPrice ?? meta.chartPreviousClose ?? closes.at(-1) ?? 0;
      const prev   = meta.chartPreviousClose ?? closes.at(-2) ?? price;
      const change    = +(price - prev).toFixed(2);
      const changePct = prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
      return {
        symbol: meta.symbol || symbol,
        name:   meta.shortName || meta.longName || symbol,
        price:  +price.toFixed(2),
        change, changePct,
        sparkline: closes.slice(-7),
      };
    } catch { clearTimeout(timer); }
  }
  return null;
}

// Detailed OHLCV data for a single stock (analysis)
async function fetchDetailed(symbol) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=60d`,
      { headers: BROWSER_HEADERS, signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta   = result.meta;
    const ts     = result.timestamp || [];
    const q      = result.indicators?.quote?.[0] || {};
    const opens  = q.open   || [];
    const highs  = q.high   || [];
    const lows   = q.low    || [];
    const closes = q.close  || [];
    const vols   = q.volume || [];

    const validCloses = closes.filter(Boolean);
    const price     = meta.regularMarketPrice ?? validCloses.at(-1);
    const prev      = meta.chartPreviousClose  ?? validCloses.at(-2) ?? price;
    const change    = +(price - prev).toFixed(2);
    const changePct = +(((price - prev) / prev) * 100).toFixed(2);
    const sma20     = sma(validCloses, 20);
    const sma50     = sma(validCloses, 50);
    const rsi       = calculateRSI(validCloses);

    const recentVol = vols.filter(Boolean).slice(-5);
    const olderVol  = vols.filter(Boolean).slice(-10, -5);
    const avgR = recentVol.reduce((a,b) => a+b, 0) / (recentVol.length || 1);
    const avgO = olderVol.reduce((a,b)  => a+b, 0) / (olderVol.length  || 1);
    const volumeTrend = avgR > avgO * 1.2 ? 'increasing' : avgR < avgO * 0.8 ? 'decreasing' : 'stable';

    const candles = [];
    for (let i = Math.max(0, ts.length - 5); i < ts.length; i++) {
      if (opens[i] && highs[i] && lows[i] && closes[i]) {
        const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
        const body = Math.abs(c - o), range = h - l;
        candles.push({
          date: new Date(ts[i] * 1000).toISOString().split('T')[0],
          open: +o.toFixed(2), high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2),
          volume: vols[i], bullish: c > o,
          bodyPct:      range > 0 ? +(Math.abs(c-o) / range * 100).toFixed(0) : 0,
          upperWickPct: range > 0 ? +((h - Math.max(o,c)) / range * 100).toFixed(0) : 0,
          lowerWickPct: range > 0 ? +((Math.min(o,c) - l) / range * 100).toFixed(0) : 0,
        });
      }
    }

    return {
      symbol, name: meta.shortName || symbol,
      price: +price.toFixed(2), change, changePct,
      high52: meta.fiftyTwoWeekHigh, low52: meta.fiftyTwoWeekLow,
      sma20, sma50, rsi, volumeTrend, candles,
      sparkline: validCloses.slice(-14),
    };
  } catch { clearTimeout(timer); return null; }
}

// ─── routes ──────────────────────────────────────────────────────────────────

// GET /api/stocks/market — batch fetch all 30 in 2 requests
router.get('/market', async (req, res) => {
  try {
    const stocks = await fetchMarketBatch(FEATURED);
    res.json({ stocks });
  } catch (err) {
    console.error('[/stocks/market]', err);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// GET /api/stocks/search/:symbol
router.get('/search/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().trim();
    const stock = await fetchSimple(symbol);
    if (!stock) return res.status(404).json({ error: `No data found for ${symbol}` });
    res.json({ stock });
  } catch (err) {
    console.error('[/stocks/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/stocks/daily — today's top 5 picks with extensive analysis
router.post('/daily', async (req, res) => {
  try {
    // Fetch detailed data for 8 stocks, pick best 5
    const results = await Promise.allSettled(FEATURED.slice(0, 8).map(fetchDetailed));
    const stocks = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .slice(0, 6);

    if (stocks.length === 0) return res.status(503).json({ error: 'Could not fetch stock data — try again.' });

    const systemPrompt = `You are an elite quantitative analyst at a top hedge fund. Analyze today's technical data and rank the top 5 stocks worth watching TODAY based on momentum, pattern strength, and risk/reward.

Be data-driven and specific. Reference actual prices, RSI values, and candlestick patterns. Write clearly — smart but not jargon-heavy.

Respond with ONLY valid JSON:
{
  "date": "<today's date>",
  "marketTheme": "<1 sentence: the dominant market narrative today>",
  "topPicks": [
    {
      "rank": 1,
      "symbol": "<ticker>",
      "name": "<company>",
      "emoji": "<emoji>",
      "technicalScore": <0-100 integer>,
      "sentiment": "bullish|neutral|bearish",
      "riskLevel": "low|medium|high",
      "whyToday": "<2 sentences: what specific technical signal makes this stock interesting TODAY>",
      "candlestickPattern": "<pattern name from last 5 candles>",
      "candlestickMeaning": "<1 sentence on what this signals>",
      "rsiReading": "<exact RSI number and zone — oversold/neutral/overbought>",
      "maSetup": "<price vs SMA20 and SMA50, trend direction>",
      "volumeRead": "<volume trend and confirmation>",
      "support": "<$ level>",
      "resistance": "<$ level>",
      "shortOutlook": "<1–3 day expected direction>",
      "weekOutlook": "<this week's view>",
      "keyRisk": "<biggest technical risk to this setup>"
    }
  ],
  "patternOfDay": {
    "pattern": "<most significant pattern found>",
    "stock": "<ticker>",
    "explanation": "<plain English: what this means for traders>"
  },
  "marketMood": "bullish|neutral|bearish",
  "disclaimer": "AI-generated educational content only. Not financial advice."
}`;

    const userMessage = `Today's technical data (${new Date().toDateString()}):\n\n${JSON.stringify(stocks.map(s => ({
      symbol: s.symbol, name: s.name, price: s.price, changePct: s.changePct,
      rsi: s.rsi, sma20: s.sma20, sma50: s.sma50,
      high52: s.high52, low52: s.low52, volumeTrend: s.volumeTrend,
      last5candles: s.candles,
    })), null, 2)}\n\nRank and return the top 5 for today. Be specific with numbers.`;

    const result = await structuredAICall(systemPrompt, userMessage, 1, 2000);
    res.json({ ...result, stocksAnalyzed: stocks.map(s => s.symbol) });
  } catch (err) {
    console.error('[/stocks/daily]', err);
    res.status(500).json({ error: 'Daily analysis failed — try again.' });
  }
});

// POST /api/stocks/analyze-stock — deep dive on a single stock
router.post('/analyze-stock', async (req, res) => {
  try {
    const symbol = (req.body.symbol || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

    const stock = await fetchDetailed(symbol);
    if (!stock) return res.status(404).json({ error: `No data found for ${symbol} — check the ticker and try again.` });

    const systemPrompt = `You are a professional technical analyst. Give a thorough, data-backed analysis of a single stock. Be direct and specific — reference the actual numbers provided. Write for a smart investor who is learning charts.

Respond with ONLY valid JSON:
{
  "symbol": "<ticker>",
  "name": "<company name>",
  "emoji": "<one emoji for this stock's vibe>",
  "verdict": "Strong Buy|Buy|Hold|Sell|Strong Sell",
  "sentiment": "bullish|neutral|bearish",
  "conviction": "high|medium|low",
  "technicalScore": <0-100>,
  "snapshot": "<2-3 sentence executive summary of the full technical picture>",
  "candlestickPattern": "<specific pattern from last 5 candles>",
  "candlestickMeaning": "<what this pattern signals and why it matters now>",
  "rsiAnalysis": "<RSI number, zone, momentum interpretation>",
  "maAnalysis": "<price vs SMA20 and SMA50 — above/below/crossing, what the trend is>",
  "volumeAnalysis": "<volume trend, what it confirms or contradicts>",
  "pricePosition": "<where price sits relative to 52-week range — is it near highs, lows, mid-range?>",
  "support": "<key support level>",
  "resistance": "<key resistance level>",
  "outlook1to3days": "<very short term direction>",
  "outlookThisWeek": "<this week's technical view>",
  "outlookNextMonth": "<longer view if trend holds>",
  "riskLevel": "low|medium|high",
  "topRisk": "<the single biggest technical risk — what could invalidate this setup>",
  "watchFor": "<specific price action or signal to watch for that would confirm or deny this analysis>"
}`;

    const userMessage = `Full technical data for ${symbol} (${stock.name}):

Price: $${stock.price}  |  Change today: ${stock.changePct > 0 ? '+' : ''}${stock.changePct}%
RSI(14): ${stock.rsi}
SMA20: $${stock.sma20}  |  SMA50: $${stock.sma50}
52-week high: $${stock.high52}  |  52-week low: $${stock.low52}
Volume trend: ${stock.volumeTrend}

Last 5 trading candles:
${JSON.stringify(stock.candles, null, 2)}

Provide a comprehensive technical analysis.`;

    const result = await structuredAICall(systemPrompt, userMessage, 1, 1200);
    res.json(result);
  } catch (err) {
    console.error('[/stocks/analyze-stock]', err);
    res.status(500).json({ error: err.message || 'Analysis failed — try again.' });
  }
});

// GET /api/stocks/news
router.get('/news', async (req, res) => {
  try {
    const queries = ['stock market economy', 'federal reserve interest rates', 'earnings trade tariffs'];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);

    const fetches = await Promise.allSettled(queries.map(q =>
      fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=5&quotesCount=0&enableFuzzyQuery=false&lang=en-US&region=US`,
        { headers: BROWSER_HEADERS, signal: ctrl.signal })
        .then(r => r.ok ? r.json() : { news: [] })
        .then(j => j.news || [])
        .catch(() => [])
    ));
    clearTimeout(timer);

    const seen = new Set();
    const items = [];
    for (const f of fetches) {
      if (f.status !== 'fulfilled') continue;
      for (const n of f.value) {
        if (!n.title || seen.has(n.title)) continue;
        seen.add(n.title);
        items.push({
          title:  n.title,
          desc:   (n.summary || '').slice(0, 250),
          source: n.publisher || '',
        });
      }
    }

    if (items.length === 0) {
      return res.status(503).json({ error: 'Could not fetch live headlines right now — try again in a moment.' });
    }

    const top = items.slice(0, 10);

    const systemPrompt = `You are MoodMoney's market news analyst. For each financial headline, explain its market impact clearly for a Gen Z investor.

Return ONLY valid JSON — no markdown:
{
  "events": [{
    "headline": "<clean title>",
    "category": "Trade|Fed|Earnings|Geopolitics|Economy|Crypto|Energy|Tech|Housing",
    "impact": "bullish|bearish|neutral",
    "impactLevel": "high|medium|low",
    "sectors": ["up to 4 from: Tech,Finance,Energy,Healthcare,Consumer,Crypto,Bonds,Commodities,Real Estate,Defense,Auto"],
    "summary": "<exactly 2 casual sentences: what happened + what it means for investors>",
    "watchTickers": ["up to 3 tickers or ETFs"],
    "emoji": "<1 emoji>"
  }],
  "marketPulse": "<one punchy sentence on today's overall vibe>",
  "hotSector": "<single most-moved sector>",
  "fearGreed": "fear|neutral|greed"
}`;

    const userMessage = `Today's headlines (${new Date().toDateString()}):\n\n${top.map((it, i) => `${i+1}. [${it.source}] ${it.title}${it.desc ? ' — ' + it.desc : ''}`).join('\n\n')}\n\nAnalyze and return JSON.`;

    const result = await structuredAICall(systemPrompt, userMessage, 1, 1800);
    res.json({ ...result, fetchedAt: new Date().toISOString(), count: top.length });
  } catch (err) {
    console.error('[/stocks/news]', err);
    res.status(500).json({ error: 'News analysis failed — try again.' });
  }
});

// GET /api/stocks/watchlist
router.get('/watchlist', async (req, res) => {
  try {
    const { data } = await supabase.from('watchlist').select('symbol').eq('user_id', req.user.id);
    res.json({ watchlist: data?.map(w => w.symbol) || [] });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch watchlist' }); }
});

// POST /api/stocks/watchlist
router.post('/watchlist', async (req, res) => {
  try {
    const { symbol } = req.body;
    await supabase.from('watchlist').upsert({ user_id: req.user.id, symbol }, { onConflict: 'user_id,symbol' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to add to watchlist' }); }
});

// DELETE /api/stocks/watchlist/:symbol
router.delete('/watchlist/:symbol', async (req, res) => {
  try {
    await supabase.from('watchlist').delete().eq('user_id', req.user.id).eq('symbol', req.params.symbol);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to remove from watchlist' }); }
});

export default router;
