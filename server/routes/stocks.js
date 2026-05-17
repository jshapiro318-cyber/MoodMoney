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

// ─── Yahoo Finance crumb session ─────────────────────────────────────────────
// Yahoo Finance requires a crumb token + session cookie for server-side requests.
const YF = { crumb: '', cookie: '', ts: 0 };

async function refreshCrumb() {
  try {
    // Step 1: Visit fc.yahoo.com to get session cookies (A1, A3, etc.)
    const r1 = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MoodMoney/1.0)' },
      redirect: 'follow',
    });
    // Extract cookie values from Set-Cookie headers
    const setCookies = r1.headers.getSetCookie
      ? r1.headers.getSetCookie()
      : (r1.headers.get('set-cookie') || '').split(/,(?=[A-Za-z_])/);
    const cookie = setCookies
      .map(c => c.split(';')[0].trim())
      .filter(c => c.includes('='))
      .join('; ');

    // Step 2: Get the crumb using those cookies
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MoodMoney/1.0)',
        'Cookie': cookie,
      },
    });

    if (r2.ok) {
      const crumb = (await r2.text()).trim();
      // Crumb should be a short alphanumeric string, not HTML
      if (crumb && crumb.length < 60 && !crumb.includes('<')) {
        YF.crumb  = crumb;
        YF.cookie = cookie;
        YF.ts     = Date.now();
        console.log('[YF] Crumb refreshed:', crumb.slice(0, 8) + '...');
        return true;
      }
    }
    console.warn('[YF] Crumb request failed, status:', r2.status);
  } catch (e) {
    console.error('[YF] Crumb refresh error:', e.message);
  }
  return false;
}

async function yfFetch(path, signal) {
  // Refresh crumb if stale (older than 45 min) or missing
  if (!YF.crumb || Date.now() - YF.ts > 45 * 60 * 1000) {
    await refreshCrumb();
  }
  const sep = path.includes('?') ? '&' : '?';
  const crumbParam = YF.crumb ? `${sep}crumb=${encodeURIComponent(YF.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com${path}${crumbParam}`;
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MoodMoney/1.0)',
      ...(YF.cookie ? { 'Cookie': YF.cookie } : {}),
    },
    ...(signal ? { signal } : {}),
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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
  const slice = arr.slice(-n).filter(Boolean);
  if (!slice.length) return null;
  return +(slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2);
}

async function fetchSimple(symbol) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await yfFetch(`/v8/finance/chart/${symbol}?interval=1d&range=7d`, ctrl.signal);
    if (!res.ok) {
      console.warn(`[fetchSimple] ${symbol} → HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta   = result.meta;
    const closes = result.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
    const price  = meta.regularMarketPrice ?? meta.chartPreviousClose ?? closes.at(-1) ?? 0;
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
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const res = await yfFetch(`/v8/finance/chart/${symbol}?interval=1d&range=60d`, ctrl.signal);
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
          bodyPct:      range > 0 ? +(body / range * 100).toFixed(0) : 0,
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
  } catch { return null; }
}

// ─── routes ──────────────────────────────────────────────────────────────────

// GET /api/stocks/health — diagnostic (no auth bypass, just for testing)
router.get('/health', async (req, res) => {
  const ok = await refreshCrumb();
  const test = ok ? await yfFetch('/v8/finance/chart/AAPL?interval=1d&range=1d') : null;
  res.json({
    crumbOk: ok,
    crumb: YF.crumb ? YF.crumb.slice(0, 6) + '...' : 'none',
    aapl: test ? { status: test.status, ok: test.ok } : 'skipped',
  });
});

// GET /api/stocks/market
router.get('/market', async (req, res) => {
  try {
    const results = await Promise.allSettled(FEATURED.map(fetchSimple));
    const stocks = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    console.log(`[/market] ${stocks.length}/${FEATURED.length} stocks loaded`);
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
router.post('/daily', async (req, res) => {
  try {
    const results = await Promise.allSettled(FEATURED.slice(0, 8).map(fetchDetailed));
    const stocks = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).slice(0, 6);
    if (stocks.length === 0) return res.status(503).json({ error: 'Could not fetch stock data — try again.' });

    const systemPrompt = `You are an elite quantitative analyst. Analyze today's technical data and rank the top 5 stocks worth watching TODAY based on momentum, pattern strength, and risk/reward. Be data-driven. Reference actual prices and RSI values.

Respond with ONLY valid JSON:
{
  "date": "<today>",
  "marketTheme": "<1 sentence: dominant market narrative today>",
  "marketMood": "bullish|neutral|bearish",
  "topPicks": [{
    "rank": 1,
    "symbol": "<ticker>",
    "name": "<company>",
    "emoji": "<emoji>",
    "technicalScore": <0-100>,
    "sentiment": "bullish|neutral|bearish",
    "riskLevel": "low|medium|high",
    "whyToday": "<2 sentences: what specific signal makes this interesting TODAY>",
    "candlestickPattern": "<pattern from last 5 candles>",
    "candlestickMeaning": "<1 sentence>",
    "rsiReading": "<RSI number + zone>",
    "maSetup": "<price vs SMA20 and SMA50>",
    "volumeRead": "<volume trend>",
    "support": "<$ level>",
    "resistance": "<$ level>",
    "shortOutlook": "<1-3 day direction>",
    "weekOutlook": "<this week view>",
    "keyRisk": "<biggest technical risk>"
  }],
  "patternOfDay": { "pattern": "<pattern>", "stock": "<ticker>", "explanation": "<plain English>" },
  "disclaimer": "AI-generated educational content only. Not financial advice."
}`;

    const userMessage = `Today (${new Date().toDateString()}) technical data:\n\n${JSON.stringify(stocks.map(s => ({
      symbol: s.symbol, name: s.name, price: s.price, changePct: s.changePct,
      rsi: s.rsi, sma20: s.sma20, sma50: s.sma50,
      high52: s.high52, low52: s.low52, volumeTrend: s.volumeTrend,
      last5candles: s.candles,
    })), null, 2)}\n\nRank top 5 for today. Be specific with numbers.`;

    const result = await structuredAICall(systemPrompt, userMessage, 1, 2000);
    res.json({ ...result, stocksAnalyzed: stocks.map(s => s.symbol) });
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

    const stock = await fetchDetailed(symbol);
    if (!stock) return res.status(404).json({ error: `No data found for ${symbol} — check the ticker.` });

    const systemPrompt = `You are a professional technical analyst. Give a thorough, data-backed analysis of this single stock. Be direct and specific — reference the actual numbers. Write clearly for a smart investor learning charts.

Respond with ONLY valid JSON:
{
  "symbol": "<ticker>",
  "name": "<company>",
  "emoji": "<one emoji>",
  "verdict": "Strong Buy|Buy|Hold|Sell|Strong Sell",
  "sentiment": "bullish|neutral|bearish",
  "conviction": "high|medium|low",
  "technicalScore": <0-100>,
  "snapshot": "<2-3 sentence executive summary>",
  "candlestickPattern": "<pattern from last 5 candles>",
  "candlestickMeaning": "<what this signals>",
  "rsiAnalysis": "<RSI number, zone, interpretation>",
  "maAnalysis": "<price vs SMA20 and SMA50>",
  "volumeAnalysis": "<volume trend and what it confirms>",
  "pricePosition": "<where price sits vs 52-week range>",
  "support": "<key support level>",
  "resistance": "<key resistance level>",
  "outlook1to3days": "<very short term>",
  "outlookThisWeek": "<this week>",
  "outlookNextMonth": "<longer view>",
  "riskLevel": "low|medium|high",
  "topRisk": "<biggest technical risk>",
  "watchFor": "<specific signal to confirm or deny this setup>"
}`;

    const userMessage = `Full technical data for ${symbol} (${stock.name}):
Price: $${stock.price}  Change: ${stock.changePct > 0 ? '+' : ''}${stock.changePct}%
RSI(14): ${stock.rsi}  |  SMA20: $${stock.sma20}  |  SMA50: $${stock.sma50}
52wk High: $${stock.high52}  |  52wk Low: $${stock.low52}
Volume trend: ${stock.volumeTrend}
Last 5 candles: ${JSON.stringify(stock.candles, null, 2)}

Provide comprehensive technical analysis.`;

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
    setTimeout(() => ctrl.abort(), 12000);
    const NEWS_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
    };
    const fetches = await Promise.allSettled(queries.map(q =>
      fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=5&quotesCount=0&enableFuzzyQuery=false&lang=en-US&region=US`,
        { headers: NEWS_HEADERS, signal: ctrl.signal })
        .then(r => r.ok ? r.json() : { news: [] })
        .then(j => j.news || [])
        .catch(() => [])
    ));

    const seen = new Set();
    const items = [];
    for (const f of fetches) {
      if (f.status !== 'fulfilled') continue;
      for (const n of f.value) {
        if (!n.title || seen.has(n.title)) continue;
        seen.add(n.title);
        items.push({ title: n.title, desc: (n.summary || '').slice(0, 250), source: n.publisher || '' });
      }
    }
    if (items.length === 0) return res.status(503).json({ error: 'Could not fetch live headlines right now.' });

    const top = items.slice(0, 10);
    const systemPrompt = `You are MoodMoney's market news analyst. For each financial headline, explain its market impact for a Gen Z investor.

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

    const userMessage = `Headlines (${new Date().toDateString()}):\n\n${top.map((it, i) => `${i+1}. [${it.source}] ${it.title}${it.desc ? ' — ' + it.desc : ''}`).join('\n\n')}\n\nAnalyze and return JSON.`;
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
