import { Router } from 'express';
import YahooFinance from 'yahoo-finance2';
import { requireAuth } from '../middleware/auth.js';
import { structuredAICall } from '../lib/claude.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

// yahoo-finance2 v3 requires instantiation
// Attach a browser User-Agent so Yahoo Finance doesn't block Node's default undici UA
const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  fetchOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },
});

const FEATURED = [
  'AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','NFLX','UBER','PLTR',
  'AMD','SOFI','COIN','RBLX','SNAP','SHOP','SQ','PYPL','GME','HOOD',
  'DIS','INTC','CRM','ORCL','BABA',
];

// TradingView requires EXCHANGE:SYMBOL format — must be the primary listing exchange
const TV_EXCHANGE = {
  AAPL:'NASDAQ', TSLA:'NASDAQ', NVDA:'NASDAQ', MSFT:'NASDAQ', AMZN:'NASDAQ',
  GOOGL:'NASDAQ', META:'NASDAQ', NFLX:'NASDAQ', UBER:'NYSE',  PLTR:'NASDAQ',
  AMD:'NASDAQ',  SOFI:'NASDAQ', COIN:'NASDAQ', RBLX:'NYSE',  SNAP:'NYSE',
  SHOP:'NYSE',   SQ:'NYSE',    PYPL:'NASDAQ', GME:'NYSE',   HOOD:'NASDAQ',
  DIS:'NYSE',    INTC:'NASDAQ', CRM:'NYSE',   ORCL:'NYSE',  BABA:'NYSE',
};

// ─── Server-side cache ─────────────────────────────────────────────────────────
// Cache detailed stock data so Top 5 can reuse market-load data without extra requests
const cache = {
  detailed: { data: null, ts: 0 },
  simple:   { data: null, ts: 0 },
};
// Exported so trading.js can read cached prices and use the shared YF rate limiter
export { cache as stocksCache, yfChart };
const CACHE_TTL = 60 * 60 * 1000; // 60 min — also serve stale cache on failures

function isFresh(entry) { return entry.data && (Date.now() - entry.ts) < CACHE_TTL; }

// Rate-limit: one in-flight YF request at a time with small gap between each
const YF_DELAY = 80; // ms between requests
let lastYFCall = 0;

async function yfChart(symbol, days, interval = '1d') {
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

// ── Approach 1: TradingView Scanner ── keyless, works from any server IP ───────
// POST https://scanner.tradingview.com/america/scan
// Columns: close, change (% from prev close), change_abs ($), description, open
// Used by countless algorithmic trading systems — highly reliable from cloud servers.
async function fetchAllPricesTradingView() {
  try {
    const tickers = FEATURED.map(sym => `${TV_EXCHANGE[sym] || 'NASDAQ'}:${sym}`);
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res   = await fetch('https://scanner.tradingview.com/america/scan', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify({
        symbols: { tickers },
        columns: ['close', 'change', 'change_abs', 'description', 'open'],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn(`[tradingview] HTTP ${res.status}`); return null; }
    const json  = await res.json();
    const items = json?.data || [];
    if (!items.length) { console.warn('[tradingview] empty response'); return null; }
    const stocks = items.map(item => {
      const sym = (item.s || '').replace(/^[^:]+:/, ''); // strip "NASDAQ:" prefix
      const [close, changePct, changeAbs, name] = item.d || [];
      if (!close || close <= 0) return null;
      return {
        symbol:    sym,
        name:      name || sym,
        price:     +close.toFixed(2),
        change:    changeAbs  != null ? +changeAbs.toFixed(2)  : 0,
        changePct: changePct  != null ? +changePct.toFixed(2)  : 0,
        sparkline: [],
      };
    }).filter(Boolean);
    console.log(`[tradingview] ${stocks.length}/${FEATURED.length} stocks`);
    return stocks.length >= 5 ? stocks : null;
  } catch (e) {
    console.warn('[fetchAllPricesTradingView]', e.message);
    return null;
  }
}

// ── Approach 2: batched yf.chart() calls (proven to work on Railway) ──────────
// Uses the same yfChart() path as the working Trade-tab price lookup.
// Groups symbols into batches of 4, waits 300 ms between batches to stay
// under Yahoo Finance's per-IP rate limit.
async function fetchAllPricesBatched() {
  const BATCH = 4;
  const DELAY = 300;
  const results = [];
  try {
    for (let i = 0; i < FEATURED.length; i += BATCH) {
      const batch = FEATURED.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map(sym => fetchSimple(sym)));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value?.price > 0) results.push(r.value);
      }
      if (i + BATCH < FEATURED.length) await new Promise(r => setTimeout(r, DELAY));
    }
    console.log(`[batched] ${results.length}/${FEATURED.length} stocks via yf.chart()`);
    return results.length >= 5 ? results : null;
  } catch (e) {
    console.warn('[fetchAllPricesBatched]', e.message);
    return results.length >= 5 ? results : null;
  }
}

// ── Stooq single-symbol realtime — no API key, works from any IP ──────────────
// URL: /q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv
// Returns the last TRADED close price (works on weekends — shows Friday's close).
// Multi-symbol bulk format doesn't work (Stooq treats "a,b,c" as one symbol).
// Must call once per symbol. Batched in groups to avoid overwhelming Stooq.
async function fetchStooqSimple(symbol) {
  try {
    const sym = symbol.toLowerCase() + '.us';
    const url = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`;
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res   = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text  = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    // Data line: AAPL.US,2026-05-15,22:00:19,297.9,303.2,296.52,300.23,54862836
    const parts = lines[1].split(',');
    const price = parseFloat(parts[6]); // Close
    const open  = parseFloat(parts[3]); // Open
    if (!price || price <= 0 || isNaN(price)) return null;
    const change    = open ? +(price - open).toFixed(2) : 0;
    const changePct = open ? +(((price - open) / open) * 100).toFixed(2) : 0;
    return { symbol, name: symbol, price: +price.toFixed(2), change, changePct, sparkline: [] };
  } catch (e) {
    console.warn(`[fetchStooqSimple] ${symbol}:`, e.message);
    return null;
  }
}

// Fetch current price info via Stooq — used as fallback in /detail and /search.
// Returns minimal data (price + empty chart) when YF is unavailable.
async function fetchStooqChart(symbol, _days) {
  const stock = await fetchStooqSimple(symbol);
  if (!stock) return null;
  // Return price info with empty chart — frontend renders gracefully without chart points
  return { price: stock.price, change: stock.change, changePct: stock.changePct, chartData: [] };
}

// ── Approach 2: Stooq individual realtime, batched ─────────────────────────────
// Single-symbol /q/l/ endpoint confirmed working from any IP, no API key needed.
// Batches of 5 with 300ms gaps to stay under Stooq's rate limit.
async function fetchAllPricesStooq() {
  const BATCH = 5;
  const results = [];
  try {
    for (let i = 0; i < FEATURED.length; i += BATCH) {
      const batch   = FEATURED.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map(sym => fetchStooqSimple(sym)));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value?.price > 0) results.push(r.value);
      }
      if (i + BATCH < FEATURED.length) await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[stooq] ${results.length}/${FEATURED.length} stocks via Stooq single-symbol realtime`);
    return results.length >= 5 ? results : null;
  } catch (e) {
    console.warn('[fetchAllPricesStooq]', e.message);
    return results.length >= 5 ? results : null;
  }
}

// ── Approach 3: Yahoo Finance crumb-authenticated bulk HTTP (kept as extra try) ─
let _yfSession = { crumb: null, cookie: null, ts: 0 };
async function getYFSession() {
  if (_yfSession.crumb && Date.now() - _yfSession.ts < 20 * 60 * 1000) return _yfSession;
  try {
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const cookieRes = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const rawCookie = (cookieRes.headers.get('set-cookie') || '').split(';')[0];
    const crumbRes  = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': rawCookie },
    });
    const crumb = (await crumbRes.text()).trim();
    if (crumb && crumb.length > 1 && !crumb.startsWith('<')) {
      _yfSession = { crumb, cookie: rawCookie, ts: Date.now() };
      return _yfSession;
    }
  } catch (e) { console.warn('[getYFSession]', e.message); }
  return null;
}
async function fetchAllPricesBulk() {
  const session = await getYFSession();
  const crumb   = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const cookie  = session?.cookie || '';
  const fields  = 'symbol,shortName,longName,regularMarketPrice,regularMarketPreviousClose,regularMarketChangePercent';
  const url     = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${FEATURED.join(',')}${crumb}&fields=${fields}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com/',
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn(`[bulk-http] HTTP ${res.status}`); return null; }
    const json    = await res.json();
    const results = json?.quoteResponse?.result || [];
    if (!results.length) { console.warn('[bulk-http] empty results'); return null; }
    const stocks = results.map(q => {
      const price = q.regularMarketPrice || 0, prev = q.regularMarketPreviousClose || price;
      return {
        symbol: q.symbol, name: q.shortName || q.longName || q.symbol,
        price: +price.toFixed(2), change: +(price - prev).toFixed(2),
        changePct: +(q.regularMarketChangePercent || 0).toFixed(2), sparkline: [],
      };
    }).filter(s => s.price > 0);
    console.log(`[bulk-http] ${stocks.length} stocks`);
    return stocks.length >= 5 ? stocks : null;
  } catch (e) { clearTimeout(timer); console.warn('[fetchAllPricesBulk]', e.message); return null; }
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

  // Test 4: TradingView (primary fallback)
  const t3 = Date.now();
  try {
    const tvRes = await fetch('https://scanner.tradingview.com/america/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://www.tradingview.com' },
      body: JSON.stringify({ symbols: { tickers: ['NASDAQ:AAPL'] }, columns: ['close','change'] }),
      signal: AbortSignal.timeout(8000),
    });
    const tvJson = await tvRes.json();
    const price  = tvJson?.data?.[0]?.d?.[0];
    results.tradingview = { ok: !!price && price > 0, price, ms: Date.now()-t3 };
  } catch (e) { results.tradingview = { ok: false, error: e.message, ms: Date.now()-t3 }; }

  // Test 5: Stooq (secondary fallback)
  const t4 = Date.now();
  try {
    const stooqRes = await fetch('https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const csv = await stooqRes.text();
    const price = parseFloat(csv.split('\n')[1]?.split(',')[6]);
    results.stooq = { ok: !!price && price > 0, price, ms: Date.now()-t4 };
  } catch (e) { results.stooq = { ok: false, error: e.message, ms: Date.now()-t4 }; }

  results.anthropicKey = !!process.env.ANTHROPIC_API_KEY;
  results.cache = { simpleStocks: cache.simple.data?.length ?? 0, simpleAgeMin: cache.simple.ts ? Math.round((Date.now()-cache.simple.ts)/60000) : null };
  res.json({ ts: new Date().toISOString(), totalMs: Date.now()-t0, ...results });
});

// All routes below require authentication
router.use(requireAuth);

// GET /api/stocks/market
router.get('/market', async (req, res) => {
  try {
    // ── Serve fresh cache ───────────────────────────────────────────────────
    if (isFresh(cache.simple)) {
      console.log('[/market] Serving from cache');
      return res.json({ stocks: cache.simple.data, cached: true });
    }

    let stocks = null;

    // ── Approach 1: TradingView scanner — keyless, works from any server IP ──
    stocks = await fetchAllPricesTradingView();

    // ── Approach 2: batched yf.chart() — YF with browser UA ─────────────────
    if (!stocks) {
      console.log('[/market] TradingView failed, trying batched YF…');
      stocks = await fetchAllPricesBatched();
    }

    // ── Approach 3: Stooq single-symbol realtime ─────────────────────────────
    if (!stocks) {
      console.log('[/market] batched failed, trying Stooq…');
      stocks = await fetchAllPricesStooq();
    }

    // ── Approach 4: YF crumb-authenticated bulk HTTP ─────────────────────────
    if (!stocks) {
      console.log('[/market] Stooq failed, trying YF bulk HTTP…');
      stocks = await fetchAllPricesBulk();
    }

    // ── Approach 5: pure sequential fetchSimple (last resort) ────────────────
    if (!stocks) {
      console.log('[/market] all bulk methods failed, trying sequential…');
      const seq = [];
      for (const sym of FEATURED) {
        const s = await fetchSimple(sym);
        if (s) seq.push(s);
      }
      if (seq.length >= 5) stocks = seq;
    }

    if (stocks?.length > 0) {
      cache.simple = { data: stocks, ts: Date.now() };
      console.log(`[/market] ${stocks.length}/${FEATURED.length} stocks loaded`);
    } else if (cache.simple.data?.length > 0) {
      // ── Stale cache fallback — never show a blank page ────────────────────
      console.log('[/market] all fetches failed — serving stale cache');
      return res.json({ stocks: cache.simple.data, stale: true });
    }

    // Pre-warm detailed cache in background (top 6 for Top 5 analysis)
    if (!isFresh(cache.detailed) && stocks?.length > 0) {
      setImmediate(async () => {
        try {
          const detailed = await fetchDetailedSequential(FEATURED.slice(0, 6));
          if (detailed.length > 0) {
            cache.detailed = { data: detailed, ts: Date.now() };
            console.log(`[cache] Warmed detailed: ${detailed.length} stocks`);
          }
        } catch (e) { console.warn('[cache] Detailed pre-warm failed:', e.message); }
      });
    }

    res.json({ stocks: stocks || [] });
  } catch (err) {
    console.error('[/stocks/market]', err);
    // Even on crash, try stale cache before returning error
    if (cache.simple.data?.length > 0) {
      return res.json({ stocks: cache.simple.data, stale: true });
    }
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// GET /api/stocks/detail/:symbol?range=1W|1M|3M|6M|1Y
router.get('/detail/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().trim();
    const range  = (req.query.range || '1M').toUpperCase();
    const rangeMap = {
      '1W':  { days: 7,   interval: '1d'  },
      '1M':  { days: 30,  interval: '1d'  },
      '3M':  { days: 90,  interval: '1d'  },
      '6M':  { days: 180, interval: '1d'  },
      '1Y':  { days: 365, interval: '1wk' },
    };
    const { days, interval } = rangeMap[range] || rangeMap['1M'];

    // Run chart + quote in parallel — both may fail independently
    const [chartRes, quoteRes] = await Promise.allSettled([
      yfChart(symbol, days, interval),
      yf.quote(symbol, {}, { validateResult: false }),
    ]);

    const chart = chartRes.status === 'fulfilled' ? chartRes.value : null;
    const quote = quoteRes.status === 'fulfilled' ? quoteRes.value : null;
    if (chartRes.status === 'rejected') console.warn(`[detail] chart error for ${symbol}:`, chartRes.reason?.message);
    if (quoteRes.status === 'rejected') console.warn(`[detail] quote error for ${symbol}:`, quoteRes.reason?.message);

    if (!chart && !quote) {
      // YF completely failed — try Stooq as a guaranteed fallback
      console.log(`[detail] YF failed for ${symbol}, trying Stooq chart fallback…`);
      const stooq = await fetchStooqChart(symbol, days);
      if (!stooq) return res.status(404).json({ error: `No data found for ${symbol}` });
      return res.json({
        symbol, name: symbol,
        price: +stooq.price.toFixed(2),
        change: stooq.change,
        changePct: stooq.changePct,
        chart: stooq.chartData, range,
        fundamentals: {
          pe: null, forwardPe: null, eps: null, beta: null,
          dividendYield: null, dividendRate: null, marketCap: null,
          volume: null, avgVolume: null, high52: null, low52: null, priceToBook: null,
        },
      });
    }

    const meta   = chart?.meta   || {};
    const quotes = chart?.quotes || [];
    const chartData = quotes
      .filter(q => q.close != null)
      .map(q => ({
        date:   new Date(q.date).toISOString().split('T')[0],
        close:  +q.close.toFixed(2),
        volume: q.volume || null,
      }));

    // If chart loaded but returned no data points, use Stooq chart instead
    if (chartData.length === 0) {
      console.log(`[detail] YF chart empty for ${symbol}, trying Stooq price fallback…`);
      const stooq = await fetchStooqChart(symbol, days);
      if (stooq) {
        const price     = quote?.regularMarketPrice ?? stooq.price;
        const change    = stooq.change;
        const changePct = stooq.changePct;
        return res.json({
          symbol:  quote?.symbol   || symbol,
          name:    quote?.longName || quote?.shortName || symbol,
          price: +price.toFixed(2), change, changePct,
          chart: stooq.chartData, range,
          fundamentals: {
            pe:            quote?.trailingPE    != null ? +quote.trailingPE.toFixed(1)    : null,
            forwardPe:     quote?.forwardPE     != null ? +quote.forwardPE.toFixed(1)     : null,
            eps:           quote?.trailingEps   != null ? +quote.trailingEps.toFixed(2)   : null,
            beta:          quote?.beta          != null ? +quote.beta.toFixed(2)          : null,
            dividendYield: quote?.dividendYield != null ? +(quote.dividendYield*100).toFixed(2) : null,
            dividendRate:  quote?.dividendRate  != null ? +quote.dividendRate.toFixed(2)  : null,
            marketCap:     quote?.marketCap     ?? null,
            volume:        quote?.regularMarketVolume ?? null,
            avgVolume:     quote?.averageVolume  ?? null,
            high52:        quote?.fiftyTwoWeekHigh ?? null,
            low52:         quote?.fiftyTwoWeekLow  ?? null,
            priceToBook:   quote?.priceToBook   != null ? +quote.priceToBook.toFixed(2)   : null,
          },
        });
      }
    }

    const price     = quote?.regularMarketPrice          ?? meta.regularMarketPrice  ?? chartData.at(-1)?.close ?? 0;
    const prev      = quote?.regularMarketPreviousClose  ?? meta.chartPreviousClose  ?? chartData.at(-2)?.close ?? price;
    const change    = +(price - prev).toFixed(2);
    const changePct = prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0;

    // dividendYield comes as a decimal fraction (0.0052 = 0.52%) from yahoo-finance2
    const divYield = quote?.dividendYield != null
      ? +(quote.dividendYield * 100).toFixed(2)
      : null;

    res.json({
      symbol:  quote?.symbol   || meta.symbol   || symbol,
      name:    quote?.longName || quote?.shortName || meta.longName || meta.shortName || symbol,
      price:   +price.toFixed(2), change, changePct,
      chart:   chartData, range,
      fundamentals: {
        pe:            quote?.trailingPE    != null ? +quote.trailingPE.toFixed(1)    : null,
        forwardPe:     quote?.forwardPE     != null ? +quote.forwardPE.toFixed(1)     : null,
        eps:           quote?.trailingEps   != null ? +quote.trailingEps.toFixed(2)   : null,
        beta:          quote?.beta          != null ? +quote.beta.toFixed(2)          : null,
        dividendYield: divYield,
        dividendRate:  quote?.dividendRate  != null ? +quote.dividendRate.toFixed(2)  : null,
        marketCap:     quote?.marketCap     ?? null,
        volume:        quote?.regularMarketVolume ?? meta.regularMarketVolume ?? null,
        avgVolume:     quote?.averageVolume  ?? null,
        high52:        quote?.fiftyTwoWeekHigh ?? meta.fiftyTwoWeekHigh ?? null,
        low52:         quote?.fiftyTwoWeekLow  ?? meta.fiftyTwoWeekLow  ?? null,
        priceToBook:   quote?.priceToBook   != null ? +quote.priceToBook.toFixed(2)   : null,
      },
    });
  } catch (err) {
    console.error('[/stocks/detail]', err);
    res.status(500).json({ error: 'Failed to load stock details' });
  }
});

// GET /api/stocks/search/:symbol
router.get('/search/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().trim();

    // Check cache first — free instant response for any of the 30 featured stocks
    // (or anything fetched recently). Only falls through to a live YF call for
    // truly unknown symbols, which avoids competing with other in-flight requests.
    const fromSimple   = cache.simple.data?.find(s => s.symbol === symbol);
    if (fromSimple)   return res.json({ stock: fromSimple });
    const fromDetailed = cache.detailed.data?.find(s => s.symbol === symbol);
    if (fromDetailed) return res.json({ stock: fromDetailed });

    // Not in cache — try live YF call, then Stooq as fallback
    let stock = await fetchSimple(symbol);
    if (!stock) {
      console.log(`[search] YF failed for ${symbol}, trying Stooq…`);
      stock = await fetchStooqSimple(symbol);
    }
    if (!stock) return res.status(404).json({ error: `No data found for "${symbol}" — check the ticker` });
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

    if (stocks.length === 0) {
      // No live data at all — ask Claude for a general market analysis
      console.log('[/daily] No live data — using AI general market knowledge');
      const fallbackPrompt = `Today is ${new Date().toDateString()}. No live market data is available right now. Based on your training knowledge about major tech stocks (AAPL, NVDA, TSLA, MSFT, AMZN, META, GOOGL) and current market themes (AI, rates, earnings), provide your best general market analysis. Be clear this is based on knowledge, not live prices.`;
      const result = await structuredAICall(systemPrompt, fallbackPrompt, 0, 2200);
      return res.json({ ...result, stocksAnalyzed: [], liveData: false });
    }

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

    const result = await structuredAICall(systemPrompt, userMessage, 0, 2200);
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

    if (!stock) {
      // No live data — fall back to pure AI analysis based on general knowledge
      console.log(`[/analyze] No live data for ${symbol} — using AI knowledge fallback`);
      stock = { symbol, name: symbol, price: null, changePct: null, sparkline: [] };
      limited = true;
    }

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

    const result = await structuredAICall(systemPrompt, userMessage, 0, 1500);
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

    const result = await structuredAICall(systemPrompt, headlinesText, 0, 1800);
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

// ─── Startup cache warmup ─────────────────────────────────────────────────────
// Delayed startup warmup using TradingView (primary source, no IP restrictions).
// Uses a 30s delay to avoid rate-limiting Yahoo Finance on server restarts.
// On failure, retries every 10 min — TradingView is very reliable so this
// should almost never fail.
async function warmupCache() {
  if (isFresh(cache.simple)) return;
  console.log('[startup] Warming stock price cache…');
  // TradingView first — works from any server IP without keys
  const stocks = await fetchAllPricesTradingView()
    || await fetchAllPricesBatched()
    || await fetchAllPricesStooq()
    || await fetchAllPricesBulk();
  if (stocks?.length > 0) {
    cache.simple = { data: stocks, ts: Date.now() };
    console.log(`[startup] Cache warm — ${stocks.length} stocks via TradingView`);
  } else {
    console.warn('[startup] Warmup failed — will retry in 10 min');
    setTimeout(warmupCache, 10 * 60 * 1000);
  }
}
// 30s delay — gives server time to stabilise and avoids hammering YF on restart
setTimeout(warmupCache, 30_000);

export default router;
