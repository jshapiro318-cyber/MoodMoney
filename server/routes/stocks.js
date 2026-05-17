import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { structuredAICall } from '../lib/claude.js';
import { supabase } from '../lib/supabase.js';

const router = Router();
router.use(requireAuth);

// Featured stocks shown by default (big names + Gen Z favourites)
const FEATURED = [
  'AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','NFLX','UBER','LYFT',
  'PLTR','AMD','SOFI','COIN','RBLX','SNAP','SHOP','SQ','PYPL','DIS',
  'SPOT','HOOD','RIVN','NIO','GME','AMC','BABA','INTC','CRM','ORCL',
];

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
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function sma(arr, n) {
  const slice = arr.slice(-n).filter(Boolean);
  if (!slice.length) return null;
  return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
}

async function fetchDetailed(symbol) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout per stock
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=60d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta   = result.meta;
    const ts     = result.timestamp || [];
    const q      = result.indicators?.quote?.[0] || {};
    const opens  = q.open  || [];
    const highs  = q.high  || [];
    const lows   = q.low   || [];
    const closes = q.close || [];
    const vols   = q.volume|| [];

    const validCloses = closes.filter(Boolean);
    const price    = meta.regularMarketPrice ?? validCloses[validCloses.length - 1];
    const prev     = meta.chartPreviousClose  ?? validCloses[validCloses.length - 2] ?? price;
    const change   = +(price - prev).toFixed(2);
    const changePct= +(((price - prev) / prev) * 100).toFixed(2);

    const sma20 = sma(validCloses, 20);
    const sma50 = sma(validCloses, 50);
    const rsi   = calculateRSI(validCloses);

    // Volume trend (recent 5 vs prior 5)
    const recentVol = vols.filter(Boolean).slice(-5);
    const olderVol  = vols.filter(Boolean).slice(-10, -5);
    const avgR = recentVol.reduce((a,b) => a+b, 0) / (recentVol.length||1);
    const avgO = olderVol.reduce((a,b)  => a+b, 0) / (olderVol.length ||1);
    const volumeTrend = avgR > avgO * 1.2 ? 'increasing' : avgR < avgO * 0.8 ? 'decreasing' : 'stable';

    // Last 5 candles
    const candles = [];
    for (let i = Math.max(0, ts.length - 5); i < ts.length; i++) {
      if (opens[i] && highs[i] && lows[i] && closes[i]) {
        const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
        const body = Math.abs(c - o);
        const range = h - l;
        const upperWick = h - Math.max(o, c);
        const lowerWick = Math.min(o, c) - l;
        candles.push({
          date: new Date(ts[i] * 1000).toISOString().split('T')[0],
          open: +o.toFixed(2), high: +h.toFixed(2),
          low: +l.toFixed(2),  close: +c.toFixed(2),
          volume: vols[i],
          bullish: c > o,
          bodyPct:  range > 0 ? +(body / range * 100).toFixed(0) : 0,
          upperWickPct: range > 0 ? +(upperWick / range * 100).toFixed(0) : 0,
          lowerWickPct: range > 0 ? +(lowerWick / range * 100).toFixed(0) : 0,
        });
      }
    }

    return {
      symbol,
      name:      meta.shortName || symbol,
      price:     +price.toFixed(2),
      change, changePct,
      high52:    meta.fiftyTwoWeekHigh,
      low52:     meta.fiftyTwoWeekLow,
      sma20, sma50, rsi, volumeTrend, candles,
      sparkline: validCloses.slice(-14),
    };
  } catch { return null; }
}

async function fetchSimple(symbol) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=7d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta   = result.meta;
    const closes = result.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
    const price  = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prev   = meta.chartPreviousClose ?? closes[closes.length - 2] ?? price;
    const change    = +(price - prev).toFixed(2);
    const changePct = +(((price - prev) / prev) * 100).toFixed(2);
    return {
      symbol,
      name: meta.shortName || symbol,
      price: +price.toFixed(2),
      change, changePct,
      sparkline: closes.slice(-7),
    };
  } catch { return null; }
}

// ─── routes ──────────────────────────────────────────────────────────────────

// GET /api/stocks/market — featured list (simple quotes, fast)
router.get('/market', async (req, res) => {
  try {
    const results = await Promise.allSettled(FEATURED.map(fetchSimple));
    const stocks = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    res.json({ stocks });
  } catch (err) {
    console.error('[/stocks/market]', err);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// GET /api/stocks/search/:symbol — search any symbol
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

// POST /api/stocks/analyze — deep technical analysis on top stocks
router.post('/analyze', async (req, res) => {
  try {
    const { symbols } = req.body;
    const targets = (symbols || FEATURED).slice(0, 5); // keep it fast

    // Fetch detailed technical data in parallel with timeout
    const results = await Promise.allSettled(targets.map(fetchDetailed));
    const stocks = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).slice(0, 4);

    const systemPrompt = `You are MoodMoney's professional technical stock analyst. Analyze stocks using real candlestick patterns, RSI, moving averages, and volume.

For each top pick, identify specific candlestick patterns from the last 5 candles (doji, hammer, shooting star, bullish/bearish engulfing, morning/evening star, spinning top, marubozu, etc.).

Explain everything in casual, Gen Z-friendly language.

Respond with ONLY valid JSON:
{
  "topPicks": [
    {
      "symbol": "<ticker>",
      "name": "<company>",
      "emoji": "<emoji>",
      "sentiment": "bullish|neutral|bearish",
      "riskLevel": "low|medium|high",
      "candlestickPattern": "<exact pattern name found in recent candles>",
      "candlestickMeaning": "<what this pattern signals in 1-2 sentences>",
      "rsiSignal": "<RSI value interpretation: oversold/neutral/overbought + what it means>",
      "movingAverageSignal": "<price vs SMA20 and SMA50: above/below/crossing, what it means>",
      "volumeSignal": "<volume trend interpretation and what it confirms or denies>",
      "overallAnalysis": "<2-3 sentence comprehensive technical summary>",
      "shortTermOutlook": "<1-2 week price direction outlook>",
      "keyLevels": "<support and resistance levels to watch>"
    }
  ],
  "marketMood": "bullish|neutral|bearish",
  "marketSummary": "<2 casual sentences on the overall market>",
  "patternOfTheDay": {
    "name": "<most interesting candlestick pattern found>",
    "stock": "<ticker it appeared on>",
    "explanation": "<what this pattern means for traders in plain English>"
  },
  "beginnerTip": "<one practical tip for reading charts>",
  "disclaimer": "This is AI-generated educational content, NOT financial advice. Past patterns do not guarantee future results. Always consult a financial advisor."
}`;

    const userMessage = `Technical data for ${stocks.length} stocks:\n${JSON.stringify(stocks.map(s => ({
      symbol: s.symbol, name: s.name,
      price: s.price, changePct: s.changePct,
      sma20: s.sma20, sma50: s.sma50, rsi: s.rsi,
      volumeTrend: s.volumeTrend,
      last5candles: s.candles,
    })), null, 2)}\n\nPick the top 3 most technically interesting stocks. Be concise.`;

    const result = await structuredAICall(systemPrompt, userMessage, 1, 1500);
    res.json({ ...result, stocksAnalyzed: stocks.map(s => s.symbol) });
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
