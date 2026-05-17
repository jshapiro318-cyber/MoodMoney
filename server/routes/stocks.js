import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { structuredAICall } from '../lib/claude.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

const TRACKED_STOCKS = [
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN',
  'GOOGL', 'META', 'PLTR', 'AMD', 'SOFI',
  'COIN', 'RBLX', 'SHOP', 'SNAP', 'UBER',
];

async function fetchQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=7d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
    const prevClose = meta.chartPreviousClose || closes[closes.length - 2] || currentPrice;
    const change = currentPrice - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      name: meta.shortName || symbol,
      price: +currentPrice.toFixed(2),
      change: +change.toFixed(2),
      changePct: +changePct.toFixed(2),
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      sparkline: closes.slice(-7),
    };
  } catch {
    return null;
  }
}

// GET /api/stocks/market
router.get('/market', async (req, res) => {
  try {
    const results = await Promise.allSettled(TRACKED_STOCKS.map(fetchQuote));
    const stocks = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
    res.json({ stocks });
  } catch (err) {
    console.error('[/stocks/market]', err);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// POST /api/stocks/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { stocks } = req.body;

    const systemPrompt = `You are MoodMoney's stock education AI. Analyze beginner-friendly stocks and explain in simple Gen Z terms.
IMPORTANT: Always clarify this is educational, not financial advice.

Respond with ONLY valid JSON:
{
  "topPicks": [
    {
      "symbol": "<ticker>",
      "name": "<company name>",
      "reason": "<1 casual sentence why it looks interesting>",
      "sentiment": "bullish|neutral|bearish",
      "riskLevel": "low|medium|high",
      "emoji": "<relevant emoji>"
    }
  ],
  "marketMood": "bullish|neutral|bearish",
  "marketSummary": "<2 casual sentences about the market right now>",
  "beginnerTip": "<one actionable tip for a first-time investor>",
  "disclaimer": "Educational only — not financial advice. Always do your own research before investing."
}`;

    const userMessage = `Stock data: ${JSON.stringify(stocks.slice(0, 15).map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      changePct: s.changePct,
    })))}
Pick 3 most interesting stocks for a beginner investor. Be casual and Gen Z friendly.`;

    const result = await structuredAICall(systemPrompt, userMessage, 2, 1024);
    res.json(result);
  } catch (err) {
    console.error('[/stocks/analyze]', err);
    res.status(500).json({ error: 'Failed to analyze stocks' });
  }
});

// GET /api/stocks/watchlist
router.get('/watchlist', async (req, res) => {
  try {
    const { data } = await supabase.from('watchlist').select('symbol').eq('user_id', req.user.id);
    res.json({ watchlist: data?.map(w => w.symbol) || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

// POST /api/stocks/watchlist
router.post('/watchlist', async (req, res) => {
  try {
    const { symbol } = req.body;
    await supabase.from('watchlist').upsert({ user_id: req.user.id, symbol }, { onConflict: 'user_id,symbol' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// DELETE /api/stocks/watchlist/:symbol
router.delete('/watchlist/:symbol', async (req, res) => {
  try {
    await supabase.from('watchlist').delete().eq('user_id', req.user.id).eq('symbol', req.params.symbol);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

export default router;
