import { Router } from 'express';
import YahooFinance from 'yahoo-finance2';
import { requireAuth } from '../middleware/auth.js';
import { structuredAICall } from '../lib/claude.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// yahoo-finance2 v3 requires instantiation
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const FEATURED = [
  'AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','NFLX','UBER','LYFT',
  'PLTR','AMD','SOFI','COIN','RBLX','SNAP','SHOP','SQ','PYPL','DIS',
  'SPOT','HOOD','RIVN','NIO','GME','AMC','BABA','INTC','CRM','ORCL',
];

// ─── Server-side cache ─────────────────────────────────────────────────────────
// Cache detailed stock data so Top 5 can reuse market-load data without extra requests
const cache = {
  detailed: { data: null, ts: 0 },
  simple:   { data: null, ts: 0 },
};
const CACHE_TTL = 12 * 60 * 1000; // 12 min

function isFresh(entry) { return entry.data && (Date.now() - entry.ts) < CACHE_TTL; }

// Rate-limit: one in-flight YF request at a time with small gap between each
const YF_DELAY = 80; // ms between requests
let lastYFCall = 0;

async function yfChart(symbol, days, interval = '1d') {
  // Space out requests to avoid rate limiting
  const now = Date.now();
  const wait = Math.max(0, YF_DELAY - (now - lastYFCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastYFCall = Date.now();

  const end   = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return yf.chart(symbol, { period1: start, period2: end, interval }, { validateResult: false });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

function sma(arr, n) {
  const slice = arr.slice(-n).filter(v => v != null && !isNaN(v));
  if (!slice.length) return null;
  return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
}

async function fetchSimple(symbol) {
  try {
    const chart = await yfChart(symbol, 10);
    if (!chart) return null;
    const meta   = chart.meta || {};
    const quotes = chart.quotes || [];
    const closes = quotes.map(q => q.close).filter(v => v != null);
    const price  = meta.regularMarketPrice ?? closes.at(-1) ?? 0;
    const prev   = meta.chartPreviousClose ?? closes.at(-2) ?? price;
    const change    = +(price - prev).toFixed(2);
    const changePct = prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
    return {
      symbol:    meta.symbol || symbol,
      name:      meta.shortName || meta.longName || symbol,
      price:     +price.toFixed(2),
      change, changePct,
      sparkline: closes.slice(-7),
    };
  } catch (e) {
    console.warn(`[fetchSimple] ${symbol} error:`, e.message);
    return null;
  }
}

async function fetchDetailed(symbol) {
  try {
    const chart = await yfChart(symbol, 65);
    if (!chart) return null;

    const meta   = chart.meta || {};
    const quotes  = chart.quotes || [];
    const closes  = quotes.map(q => q.close).filter(v => v != null);
    const vols    = quotes.map(q => q.volume).filter(v => v != null);

    const price     = meta.regularMarketPrice ?? closes.at(-1) ?? 0;
    const prev      = meta.chartPreviousClose  ?? closes.at(-2) ?? price;
    const change    = +(price - prev).toFixed(2);
    const changePct = +(((price - prev) / prev) * 100).toFixed(2);
    const rsi       = calculateRSI(closes);
    const sma20     = sma(closes, 20);
    const sma50     = sma(closes, 50);

    const recentVol = vols.slice(-5);
    const olderVol  = vols.slice(-10, -5);
    const avgR = recentVol.reduce((a,b) => a+b, 0) / (recentVol.length || 1);
    const avgO = olderVol.reduce((a,b) => a+b, 0)  / (olderVol.length  || 1);
    const volumeTrend = avgR > avgO * 1.2 ? 'increasing' : avgR < avgO * 0.8 ? 'decreasing' : 'stable';

    const last5 = quotes.slice(-5);
    const candles = last5.map(q => {
      const o = q.open, h = q.high, l = q.low, c = q.close;
      if (!o || !h || !l || !c) return null;
      const body  = Math.abs(c - o), range = h - l;
      return {
        date: new Date(q.date).toISOString().split('T')[0],
        open: +o.toFixed(2), high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2),
        volume: q.volume, bullish: c > o,
        bodyPct:      range > 0 ? +(body / range * 100).toFixed(0) : 0,
        upperWickPct: range > 0 ? +((h - Math.max(o,c)) / range * 100).toFixed(0) : 0,
        lowerWickPct: range > 0 ? +((Math.min(o,c) - l) / range * 100).toFixed(0) : 0,
      };
    }).filter(Boolean);

    return {
      symbol:    meta.symbol || symbol,
      name:      meta.shortName || meta.longName || symbol,
      price:     +price.toFixed(2), change, changePct,
      high52:    meta.fiftyTwoWeekHigh, low52: meta.fiftyTwoWeekLow,
      sma20, sma50, rsi, volumeTrend, candles,
      sparkline: closes.slice(-14),
    };
  } catch (e) {
    console.warn(`[fetchDetailed] ${symbol} error:`, e.message);
    return null;
  }
}

// Fetch multiple symbols sequentially to avoid rate-limiting
async function fetchDetailedSequential(symbols) {
  const results = [];
  for (const sym of symbols) {
    const r = await fetchDetailed(sym);
    results.push(r);
  }
  return results.filter(Boolean);
}

// ─── routes ──────────────────────────────────────────────────────────────────

// GET /api/stocks/health — public diagnostic
router.get('/health', async (req, res) => {
  const results = {};
  const t0 = Date.now();

  // Test 1: Yahoo Finance (one stock)
  try {
    const chart = await yfChart('AAPL', 3);
    results.yahoo = { ok: !!chart?.meta?.regularMarketPrice, price: chart?.meta?.regularMarketPrice, ms: Date.now()-t0 };
  } catch (e) { results.yahoo = { ok: false, error: e.message }; }

  // Test 2: fetchDetailed
  const t1 = Date.now();
  try {
    const s = await fetchDetailed('AAPL');
    results.detailed = { ok: !!s, rsi: s?.rsi, candles: s?.candles?.length, ms: Date.now()-t1 };
  } catch (e) { results.detailed = { ok: false, error: e.message }; }

  // Test 3: Claude (quick ping)
  const t2 = Date.now();
  try {
    const { structuredAICall } = await import('../lib/claude.js');
    const r = await Promise.race([
      structuredAICall('Reply ONLY: {"ok":true}', 'ping', 0, 10),
      new Promise((_, rej) => setTimeout(() => rej(new Error('claude_timeout_15s')), 15000)),
    ]);
    results.claude = { ok: r?.ok === true, ms: Date.now()-t2 };
  } catch (e) { results.claude = { ok: false, error: e.message, ms: Date.now()-t2 }; }

  results.anthropicKey = !!process.env.ANTHROPIC_API_KEY;
  res.json({ ts: new Date().toISOString(), totalMs: Date.now()-t0, ...results });
});

// All routes below require authentication
router.use(requireAuth);

// GET /api/stocks/market
router.get('/market', async (req, res) => {
  try {
    // Serve from cache if fresh
    if (isFresh(cache.simple)) {
      console.log('[/market] Serving from cache');
      return res.json({ stocks: cache.simple.data, cached: true });
    }

    // Fetch all FEATURED stocks. yfChart has an 80ms gap between requests,
    // so 30 stocks = ~2.4s sequential. Worth it to avoid rate-limiting.
    const stocks = [];
    for (const sym of FEATURED) {
      const s = await fetchSimple(sym);
      if (s) stocks.push(s);
    }

    console.log(`[/market] ${stocks.length}/${FEATURED.length} stocks loaded`);
    cache.simple = { data: stocks, ts: Date.now() };

    // Pre-warm detailed cache in background (top 6 for Top 5 analysis)
    if (!isFresh(cache.detailed)) {
      setImmediate(async () => {
        try {
          const detailed = await fetchDetailedSequential(FEATURED.slice(0, 6));
          if (detailed.length > 0) {
            cache.detailed = { data: detailed, ts: Date.now() };
            console.log(`[cache] Warmed detailed cache: ${detailed.length} stocks`);
          }
        } catch (e) { console.warn('[cache] Detailed pre-warm failed:', e.message); }
      });
    }

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

// POST /api/stocks/daily — today's top 5
// Accepts optional `marketStocks` from frontend (already-loaded price data)
// so we don't need extra Yahoo Finance calls, which are sometimes blocked.
router.post('/daily', async (req, res) => {
  try {
    let stocks = [];
    let hasDetailedData = false;

    // Priority 1: cached detailed data (has RSI/SMA/candles)
    if (isFresh(cache.detailed) && cache.detailed.data?.length >= 5) {
      stocks = cache.detailed.data.slice(0, 8);
      hasDetailedData = true;
      console.log('[/daily] Using cached detailed data');

    // Priority 2: market data sent by frontend (price + sparkline, no RSI/SMA)
    } else if (req.body.marketStocks && req.body.marketStocks.length >= 5) {
      stocks = req.body.marketStocks.slice(0, 15);
      // Try to enrich with detailed cache if partially warm
      if (cache.detailed.data?.length > 0) {
        stocks = stocks.map(s => cache.detailed.data.find(d => d.symbol === s.symbol) || s);
        hasDetailedData = stocks.some(s => s.rsi != null);
      }
      console.log(`[/daily] Using frontend market data (${stocks.length} stocks, detailed=${hasDetailedData})`);

    // Priority 3: fetch fresh from Yahoo Finance (may fail if IP is blocked)
    } else {
      console.log('[/daily] Fetching detailed data sequentially');
      stocks = await fetchDetailedSequential(FEATURED.slice(0, 5));
      if (stocks.length > 0) {
        cache.detailed = { data: stocks, ts: Date.now() };
        hasDetailedData = true;
      }
    }

    if (stocks.length === 0) {
      return res.status(503).json({ error: 'No market data available — go to Market tab first, then try again.' });
    }

    const systemPrompt = `You are an elite quantitative analyst and market strategist. Analyze today's market data and identify the top 5 stocks worth watching TODAY. Be specific and data-driven — reference actual prices and percentages from the data provided.

Respond with ONLY valid JSON (no markdown):
{
  "date": "${new Date().toDateString()}",
  "marketTheme": "<1 punchy sentence on today's dominant market theme>",
  "marketMood": "bullish|neutral|bearish",
  "topPicks": [
    {
      "rank": 1,
      "symbol": "<ticker>",
      "name": "<company name>",
      "emoji": "<1 emoji>",
      "technicalScore": <0-100>,
      "sentiment": "bullish|neutral|bearish",
      "riskLevel": "low|medium|high",
      "whyToday": "<2 sentences: the specific momentum signal or setup that makes this interesting TODAY>",
      "candlestickPattern": "${hasDetailedData ? '<pattern name>' : 'N/A — insufficient data'}",
      "candlestickMeaning": "${hasDetailedData ? '<what this signals>' : 'N/A'}",
      "rsiReading": "${hasDetailedData ? '<RSI value + zone (oversold/neutral/overbought)>' : 'N/A'}",
      "maSetup": "${hasDetailedData ? '<price vs SMA20 and SMA50>' : 'N/A'}",
      "volumeRead": "${hasDetailedData ? '<volume trend>' : 'N/A'}",
      "support": "<estimated support level>",
      "resistance": "<estimated resistance level>",
      "shortOutlook": "<1-3 day direction>",
      "weekOutlook": "<this week view>",
      "keyRisk": "<biggest risk to this setup>"
    }
  ],
  "patternOfDay": { "pattern": "<chart pattern name>", "stock": "<ticker>", "explanation": "<plain English explanation>" },
  "disclaimer": "AI-generated educational content only. Not financial advice."
}`;

    const stockSummary = stocks.slice(0, 10).map(s => {
      const trend = s.sparkline?.length >= 2
        ? (s.sparkline.at(-1) > s.sparkline[0] ? 'uptrend' : 'downtrend')
        : 'unknown';
      return {
        symbol: s.symbol, name: s.name, price: s.price,
        changeToday: `${s.changePct > 0 ? '+' : ''}${s.changePct}%`,
        trend7d: trend,
        ...(s.rsi != null && { rsi: s.rsi, sma20: s.sma20, sma50: s.sma50,
          volumeTrend: s.volumeTrend, high52: s.high52, low52: s.low52 }),
        ...(s.candles?.length && { last5candles: s.candles }),
      };
    });

    const userMessage = `Market data for ${new Date().toDateString()}:\n${JSON.stringify(stockSummary, null, 2)}\n\nRank the top 5. Reference specific prices and % changes.`;

    const result = await structuredAICall(systemPrompt, userMessage, 0, 1800);
    res.json({ ...result, stocksAnalyzed: stocks.slice(0, 10).map(s => s.symbol) });
  } catch (err) {
    console.error('[/stocks/daily]', err);
    res.status(500).json({ error: 'Daily analysis failed — try again.' });
  }
});

// POST /api/stocks/analyze-stock — deep dive on one stock
router.post('/analyze-stock', async (req, res) => {
  try {
    const symbol = (req.body.symbol || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

    // Try detailed data first (cache → fresh fetch)
    let stock = (isFresh(cache.detailed) && cache.detailed.data?.find(s => s.symbol === symbol))
      || await fetchDetailed(symbol);

    // Fallback: use simple data from cache or a lightweight fetch
    let limited = false;
    if (!stock) {
      stock = cache.simple.data?.find(s => s.symbol === symbol) || await fetchSimple(symbol);
      limited = true;
      console.log(`[/analyze] Fell back to simple data for ${symbol}`);
    }

    if (!stock) return res.status(404).json({ error: `"${symbol}" not found — check the ticker and try again.` });

    const hasDetail = !limited && stock.rsi != null;
    const systemPrompt = `You are a professional technical analyst. Analyze this stock and give a clear, specific verdict. ${hasDetail ? 'Reference the exact numbers provided.' : 'Use your expert knowledge of this stock and current market conditions since live technical data is limited.'} Write for a smart Gen Z investor learning to read the market.

Respond with ONLY valid JSON (no markdown, no extra text):
{
  "symbol": "<ticker>",
  "name": "<company name>",
  "emoji": "<one relevant emoji>",
  "verdict": "Strong Buy|Buy|Hold|Sell|Strong Sell",
  "sentiment": "bullish|neutral|bearish",
  "conviction": "high|medium|low",
  "technicalScore": <0-100>,
  "snapshot": "<2-3 sentence summary of the setup>",
  "candlestickPattern": "<recent pattern or 'N/A'>",
  "candlestickMeaning": "<what it signals or 'N/A'>",
  "rsiAnalysis": "<RSI reading + interpretation, or general momentum if N/A>",
  "maAnalysis": "<moving average setup or general trend if N/A>",
  "volumeAnalysis": "<volume interpretation>",
  "pricePosition": "<where price sits vs recent range>",
  "support": "<key support level>",
  "resistance": "<key resistance level>",
  "outlook1to3days": "<very short term view>",
  "outlookThisWeek": "<this week>",
  "outlookNextMonth": "<longer view>",
  "riskLevel": "low|medium|high",
  "topRisk": "<biggest risk>",
  "watchFor": "<specific signal to watch>"
}`;

    const userMessage = hasDetail
      ? `Technical data for ${symbol} (${stock.name}):
Price: $${stock.price}  Change: ${stock.changePct > 0 ? '+' : ''}${stock.changePct}%
RSI(14): ${stock.rsi}  |  SMA20: $${stock.sma20}  |  SMA50: $${stock.sma50}
52wk High: $${stock.high52}  |  52wk Low: $${stock.low52}
Volume: ${stock.volumeTrend}
Last 5 candles: ${JSON.stringify(stock.candles, null, 2)}`
      : `Current data for ${symbol} (${stock.name || symbol}):
Price: $${stock.price}  Today: ${stock.changePct > 0 ? '+' : ''}${stock.changePct}%
7-day trend: ${stock.sparkline?.length >= 2 ? (stock.sparkline.at(-1) > stock.sparkline[0] ? 'up' : 'down') : 'unknown'}
Note: Live technical indicators unavailable — use general knowledge of this stock.`;

    const result = await structuredAICall(systemPrompt, userMessage, 0, 1000);
    res.json(result);
  } catch (err) {
    console.error('[/stocks/analyze-stock]', err);
    res.status(500).json({ error: err.message || 'Analysis failed — try again.' });
  }
});

// GET /api/stocks/news
router.get('/news', async (req, res) => {
  try {
    // Try Yahoo Finance search — if it fails, we still run Claude on major known topics
    const queries = ['stock market earnings', 'federal reserve rates', 'trade tariffs economy'];
    let items = [];

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000); // fail fast so AI fallback kicks in quickly

    const fetches = await Promise.allSettled(queries.map(q =>
      fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=5&quotesCount=0&lang=en-US&region=US`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Accept: 'application/json' },
        signal: ctrl.signal,
      }).then(r => r.ok ? r.json() : { news: [] }).then(j => j.news || []).catch(() => [])
    ));

    const seen = new Set();
    for (const f of fetches) {
      if (f.status !== 'fulfilled') continue;
      for (const n of f.value) {
        if (!n.title || seen.has(n.title)) continue;
        seen.add(n.title);
        items.push({ title: n.title, desc: (n.summary || '').slice(0, 250), source: n.publisher || 'Yahoo Finance' });
      }
    }

    // If Yahoo Finance gave us nothing, ask Claude to generate analysis of current known market events
    const useGeneratedHeadlines = items.length === 0;
    const headlinesText = useGeneratedHeadlines
      ? 'Generate analysis based on major ongoing market themes: Fed policy & interest rates, US-China trade relations, AI/tech earnings season, energy prices, and consumer spending trends. Treat these as current market events.'
      : `Headlines (${new Date().toDateString()}):\n\n${items.slice(0, 10).map((it, i) => `${i+1}. [${it.source}] ${it.title}${it.desc ? ' — ' + it.desc : ''}`).join('\n\n')}\n\nAnalyze and return JSON.`;

    const systemPrompt = `You are MoodMoney's market news analyst. ${useGeneratedHeadlines ? 'Generate insightful market event analysis' : 'For each financial headline, explain its market impact'} for a Gen Z investor.

Return ONLY valid JSON:
{
  "events": [{
    "headline": "<clean title>",
    "category": "Trade|Fed|Earnings|Geopolitics|Economy|Crypto|Energy|Tech|Housing",
    "impact": "bullish|bearish|neutral",
    "impactLevel": "high|medium|low",
    "sectors": ["up to 4 from: Tech,Finance,Energy,Healthcare,Consumer,Crypto,Bonds,Commodities,Real Estate,Defense,Auto"],
    "summary": "<exactly 2 casual sentences: what happened + what it means for investors>",
    "watchTickers": ["up to 3 tickers"],
    "emoji": "<1 emoji>"
  }],
  "marketPulse": "<one punchy sentence on today's vibe>",
  "hotSector": "<most-moved sector>",
  "fearGreed": "fear|neutral|greed"
}`;

    const result = await structuredAICall(systemPrompt, headlinesText, 0, 1500);
    res.json({ ...result, fetchedAt: new Date().toISOString(), count: items.length, source: useGeneratedHeadlines ? 'ai-generated' : 'yahoo-finance' });
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
  } catch { res.status(500).json({ error: 'Failed to fetch watchlist' }); }
});

// POST /api/stocks/watchlist
router.post('/watchlist', async (req, res) => {
  try {
    const { symbol } = req.body;
    await supabase.from('watchlist').upsert({ user_id: req.user.id, symbol }, { onConflict: 'user_id,symbol' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to add to watchlist' }); }
});

// DELETE /api/stocks/watchlist/:symbol
router.delete('/watchlist/:symbol', async (req, res) => {
  try {
    await supabase.from('watchlist').delete().eq('user_id', req.user.id).eq('symbol', req.params.symbol);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to remove from watchlist' }); }
});

export default router;
