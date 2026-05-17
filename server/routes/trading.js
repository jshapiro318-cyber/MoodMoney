import { Router } from 'express';
import YahooFinance from 'yahoo-finance2';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { stocksCache } from './stocks.js';

const router = Router();

// Trading has its own isolated YF instance + rate limiter so it never
// interferes with the stocks routes (different module, different queue).
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const YF_DELAY = 120;
let lastYFCall = 0;

async function yfChart(symbol, days, interval = '1d') {
  const now  = Date.now();
  const wait = Math.max(0, YF_DELAY - (now - lastYFCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastYFCall = Date.now();
  const end   = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return yf.chart(symbol, { period1: start, period2: end, interval }, { validateResult: false });
}

// ── Premium gate ──────────────────────────────────────────────────────────────
// Read env var dynamically on every request so Railway env changes take effect
// without needing a redeploy.
function requirePremium(req, res, next) {
  const bypass = (process.env.PREMIUM_BYPASS_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (bypass.includes(req.user.email?.toLowerCase())) return next();
  // Future: check user_profiles.is_premium = true
  return res.status(403).json({
    error: 'premium_required',
    message: 'Paper Trading is a Premium feature. Upgrade to unlock.',
  });
}

router.use(requireAuth);
router.use(requirePremium);

// ── YF helpers ────────────────────────────────────────────────────────────────
// Check stocks cache first — if the user loaded the Market tab recently, prices
// are already there and we make zero extra YF calls.
function getCachedPrice(symbol) {
  const simple   = stocksCache.simple.data?.find(s => s.symbol === symbol);
  if (simple) return simple.price;
  const detailed = stocksCache.detailed.data?.find(s => s.symbol === symbol);
  if (detailed) return detailed.price;
  return null;
}

async function fetchLivePrice(symbol) {
  const cached = getCachedPrice(symbol);
  if (cached) return cached;
  try {
    const chart  = await yfChart(symbol, 5);
    const price  = chart?.meta?.regularMarketPrice;
    if (price) return +price.toFixed(2);
    const closes = (chart?.quotes || []).map(q => q.close).filter(Boolean);
    return closes.length ? +closes.at(-1).toFixed(2) : null;
  } catch (e) {
    console.warn(`[trading] price error ${symbol}:`, e.message);
    return null;
  }
}

async function fetchLivePrices(symbols) {
  const result = {};
  for (const sym of symbols) result[sym] = await fetchLivePrice(sym);
  return result;
}

// ── Portfolio helpers ─────────────────────────────────────────────────────────
async function getOrCreatePortfolio(userId) {
  // Try insert-if-not-exists
  await supabase.from('paper_portfolios')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });

  const { data, error } = await supabase
    .from('paper_portfolios').select().eq('user_id', userId).single();
  if (error) throw error;
  return data;
}

// ── GET /portfolio ────────────────────────────────────────────────────────────
router.get('/portfolio', async (req, res) => {
  try {
    const portfolio = await getOrCreatePortfolio(req.user.id);

    const { data: positions } = await supabase
      .from('paper_positions').select('*')
      .eq('user_id', req.user.id).gt('shares', 0);

    const symbols = (positions || []).map(p => p.symbol);
    const prices  = symbols.length ? await fetchLivePrices(symbols) : {};

    const enriched = (positions || []).map(p => {
      const price       = prices[p.symbol] ?? null;
      const costBasis   = +(p.avg_cost * p.shares).toFixed(2);
      const currentVal  = price != null ? +(price * p.shares).toFixed(2) : null;
      const unrealized  = currentVal != null ? +(currentVal - costBasis).toFixed(2) : null;
      const unrlzdPct   = costBasis > 0 && unrealized != null
        ? +((unrealized / costBasis) * 100).toFixed(2) : null;
      return {
        symbol: p.symbol, shares: +p.shares, avgCost: +p.avg_cost,
        currentPrice: price, currentValue: currentVal,
        costBasis, unrealized, unrealizedPct: unrlzdPct,
      };
    });

    const invested   = enriched.reduce((s, p) => s + (p.currentValue ?? p.costBasis), 0);
    const totalValue = +(portfolio.cash + invested).toFixed(2);
    const totalReturn = +(totalValue - 100000).toFixed(2);
    const totalReturnPct = +((totalReturn / 100000) * 100).toFixed(2);

    res.json({
      cash: +portfolio.cash, totalValue, totalReturn, totalReturnPct,
      positions: enriched, startingBalance: 100000,
    });
  } catch (err) {
    console.error('[/trading/portfolio]', err);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

// ── POST /trade ───────────────────────────────────────────────────────────────
router.post('/trade', async (req, res) => {
  try {
    const { symbol, action, shares } = req.body;
    if (!symbol || !action || !shares)
      return res.status(400).json({ error: 'symbol, action, and shares required' });
    if (!['buy', 'sell'].includes(action))
      return res.status(400).json({ error: 'action must be buy or sell' });

    const qty = +shares;
    if (qty <= 0 || qty > 10000) return res.status(400).json({ error: 'Invalid share count' });

    const sym   = symbol.toUpperCase().trim();
    const price = await fetchLivePrice(sym);
    if (!price) return res.status(503).json({ error: `Could not fetch live price for ${sym} — check the ticker` });

    const total     = +(price * qty).toFixed(2);
    const portfolio = await getOrCreatePortfolio(req.user.id);

    if (action === 'buy') {
      if (portfolio.cash < total)
        return res.status(400).json({
          error: `Insufficient funds — you have $${portfolio.cash.toFixed(2)} but need $${total.toFixed(2)}`,
        });

      const { data: existing } = await supabase
        .from('paper_positions').select().eq('user_id', req.user.id).eq('symbol', sym).single();

      const newShares  = +((existing?.shares || 0) + qty).toFixed(6);
      const newAvgCost = existing
        ? +((existing.avg_cost * existing.shares + total) / newShares).toFixed(4)
        : +price.toFixed(4);

      await supabase.from('paper_positions').upsert(
        { user_id: req.user.id, symbol: sym, shares: newShares, avg_cost: newAvgCost, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,symbol' }
      );
      await supabase.from('paper_portfolios')
        .update({ cash: +(portfolio.cash - total).toFixed(2), updated_at: new Date().toISOString() })
        .eq('user_id', req.user.id);

    } else { // sell
      const { data: pos } = await supabase
        .from('paper_positions').select().eq('user_id', req.user.id).eq('symbol', sym).single();

      if (!pos || +pos.shares < qty - 0.0001)
        return res.status(400).json({ error: `You only own ${pos?.shares ?? 0} shares of ${sym}` });

      const remaining = +(pos.shares - qty).toFixed(6);
      if (remaining < 0.0001) {
        await supabase.from('paper_positions').delete().eq('user_id', req.user.id).eq('symbol', sym);
      } else {
        await supabase.from('paper_positions')
          .update({ shares: remaining, updated_at: new Date().toISOString() })
          .eq('user_id', req.user.id).eq('symbol', sym);
      }
      await supabase.from('paper_portfolios')
        .update({ cash: +(portfolio.cash + total).toFixed(2), updated_at: new Date().toISOString() })
        .eq('user_id', req.user.id);
    }

    // Log trade
    await supabase.from('paper_trades').insert({
      user_id: req.user.id, symbol: sym, action,
      shares: qty, price: +price.toFixed(4), total,
    });

    res.json({
      success: true, symbol: sym, action, shares: qty,
      price: +price.toFixed(2), total,
      message: `${action === 'buy' ? 'Bought' : 'Sold'} ${qty} share${qty !== 1 ? 's' : ''} of ${sym} at $${price.toFixed(2)}`,
    });
  } catch (err) {
    console.error('[/trading/trade]', err);
    res.status(500).json({ error: err.message || 'Trade failed' });
  }
});

// ── GET /price/:symbol — live price for the trade form ───────────────────────
router.get('/price/:symbol', async (req, res) => {
  try {
    const sym = req.params.symbol.toUpperCase().trim();

    // Try stocks cache first (free, instant)
    const cached = getCachedPrice(sym);
    if (cached) {
      const meta = stocksCache.simple.data?.find(s => s.symbol === sym) || {};
      return res.json({ symbol: sym, name: meta.name || sym, price: cached, changePct: meta.changePct ?? null });
    }

    // Fresh YF fetch
    const chart = await yfChart(sym, 5);
    const meta  = chart?.meta || {};
    const price = meta.regularMarketPrice;
    if (!price) return res.status(404).json({ error: `"${sym}" not found — check the ticker` });

    const prev      = meta.chartPreviousClose ?? price;
    const changePct = prev ? +((price - prev) / prev * 100).toFixed(2) : null;
    res.json({ symbol: meta.symbol || sym, name: meta.shortName || meta.longName || sym, price: +price.toFixed(2), changePct });
  } catch (err) {
    console.error('[/trading/price]', err);
    res.status(500).json({ error: `Could not fetch price for ${req.params.symbol.toUpperCase()} — check the ticker` });
  }
});

// ── GET /history ──────────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const { data } = await supabase.from('paper_trades').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
    res.json({ trades: data || [] });
  } catch { res.status(500).json({ error: 'Failed to fetch history' }); }
});

// ── POST /reset ───────────────────────────────────────────────────────────────
router.post('/reset', async (req, res) => {
  try {
    await supabase.from('paper_portfolios')
      .upsert({ user_id: req.user.id, cash: 100000, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    await supabase.from('paper_positions').delete().eq('user_id', req.user.id);
    await supabase.from('paper_trades').delete().eq('user_id', req.user.id);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Reset failed' }); }
});

// ── GET /quiz ─────────────────────────────────────────────────────────────────
const QUIZ_POOL = ['AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL','AMD','PLTR','COIN','JPM','DIS','NFLX','UBER','SHOP'];

const NEWS_SCENARIOS = [
  { headline: 'Fed announces surprise 0.50% rate cut — cites slowing economic growth', ticker: 'JPM', correct: 'up', why: 'Rate cuts reduce borrowing costs and boost loan demand. Banks like JPMorgan typically rally on dovish Fed pivots as net interest margins stabilize.' },
  { headline: 'NVIDIA crushes earnings — beats by 48%, raises full-year guidance', ticker: 'NVDA', correct: 'up', why: 'A massive beat + raised guidance signals insatiable AI chip demand. Analysts upgrade their price targets and momentum traders pile in.' },
  { headline: 'US announces sweeping 30% tariffs on all Chinese tech imports', ticker: 'AAPL', correct: 'down', why: 'Apple assembles most iPhones in China. Heavy tariffs mean either eating the cost (hurting margins) or raising prices (hurting sales). Both are bearish.' },
  { headline: 'Bitcoin crashes 35% overnight after SEC bans all crypto spot ETFs', ticker: 'COIN', correct: 'down', why: 'Coinbase lives and dies by crypto trading volume. A crash kills transaction fees instantly — their revenue falls in real time with the price.' },
  { headline: 'Amazon announces 20,000 layoffs and a $15B buyback program', ticker: 'AMZN', correct: 'up', why: 'Wall Street loves cost discipline + buybacks. The market reads this as management prioritizing shareholder returns and margin improvement.' },
  { headline: 'Google loses landmark antitrust case — judge orders search ad unit spinoff', ticker: 'GOOGL', correct: 'down', why: 'Search ads are Google\'s crown jewel at ~60% of revenue. A forced spinoff would permanently damage their earnings power and monopoly pricing.' },
  { headline: 'Microsoft wins $12B Pentagon AI contract for cloud + generative AI', ticker: 'MSFT', correct: 'up', why: 'Large government contracts add predictable recurring revenue and validate Azure\'s AI leadership — key catalysts for multiple expansion.' },
  { headline: 'Tesla recalls 500,000 vehicles over critical autopilot software defect', ticker: 'TSLA', correct: 'down', why: 'Recalls are expensive (direct costs + legal exposure) and damage consumer confidence in Tesla\'s core self-driving narrative — which drives its premium valuation.' },
  { headline: 'Oil surges 20% after OPEC+ announces surprise production cuts of 3M barrels/day', ticker: 'XOM', correct: 'up', why: 'Exxon\'s revenue is directly proportional to oil prices. Higher crude prices instantly expand margins across exploration, production, and refining.' },
  { headline: 'Consumer confidence index hits 10-year low — recession fears spike', ticker: 'AMZN', correct: 'down', why: 'Low consumer confidence signals people are cutting discretionary spending. Amazon\'s retail segment (still a big revenue chunk) takes the first hit.' },
  { headline: 'Meta announces AI-powered ad targeting doubles click-through rates in tests', ticker: 'META', correct: 'up', why: 'Advertising efficiency is Meta\'s core value proposition to brands. Better targeting = higher CPMs = more ad spend on the platform = revenue acceleration.' },
  { headline: 'Shopify loses PayPal partnership — payment processing switching to competitor', ticker: 'SHOP', correct: 'down', why: 'Losing a major payment partner increases friction for merchants, can slow merchant acquisition, and signals potential competitive weakness in the ecosystem.' },
];

router.get('/quiz', async (req, res) => {
  try {
    const type = req.query.type === 'news' ? 'news' : 'chart';

    if (type === 'chart') {
      const symbol = QUIZ_POOL[Math.floor(Math.random() * QUIZ_POOL.length)];
      const raw    = await yfChart(symbol, 55);
      const quotes = (raw.quotes || []).filter(q => q.close != null);

      if (quotes.length < 10) return res.status(503).json({ error: 'Not enough data — tap refresh to try again' });

      const cutIdx   = Math.max(quotes.length - 5, 5);
      const history  = quotes.slice(0, cutIdx).map(q => ({
        date: new Date(q.date).toISOString().split('T')[0],
        close: +q.close.toFixed(2),
        volume: q.volume || 0,
      }));
      const future   = quotes.slice(cutIdx).map(q => ({
        date: new Date(q.date).toISOString().split('T')[0],
        close: +q.close.toFixed(2),
      }));

      const lastClose = history.at(-1).close;
      const endClose  = future.length ? future.at(-1).close : lastClose;
      const pct       = +((endClose - lastClose) / lastClose * 100).toFixed(2);
      const correct   = pct > 2 ? 'up' : pct < -2 ? 'down' : 'neutral';
      const name      = raw.meta?.shortName || symbol;

      res.json({
        type: 'chart', symbol, name, history,
        question: `Looking at ${name} (${symbol}) — where does this stock head over the next 5 trading days?`,
        options: [
          { value: 'up',      label: '📈 Up',      desc: '> +2%' },
          { value: 'down',    label: '📉 Down',     desc: '< -2%' },
          { value: 'neutral', label: '↔️ Sideways', desc: 'Within ±2%' },
        ],
        token: Buffer.from(JSON.stringify({ symbol, name, correct, future, lastClose, endClose, pct })).toString('base64'),
      });
    } else {
      const s = NEWS_SCENARIOS[Math.floor(Math.random() * NEWS_SCENARIOS.length)];
      res.json({
        type: 'news',
        headline: s.headline,
        ticker: s.ticker,
        question: `🚨 Breaking: "${s.headline.substring(0, 80)}…" — How does ${s.ticker} react?`,
        options: [
          { value: 'up',      label: '📈 Up',      desc: 'Positive catalyst → stock rises' },
          { value: 'down',    label: '📉 Down',     desc: 'Negative catalyst → stock falls' },
          { value: 'neutral', label: '↔️ Sideways', desc: 'Mixed signals, minimal move' },
        ],
        token: Buffer.from(JSON.stringify({ correct: s.correct, explanation: s.why, ticker: s.ticker, headline: s.headline })).toString('base64'),
      });
    }
  } catch (err) {
    console.error('[/trading/quiz]', err);
    res.status(500).json({ error: 'Quiz generation failed — try again' });
  }
});

// ── POST /quiz/answer ─────────────────────────────────────────────────────────
router.post('/quiz/answer', async (req, res) => {
  try {
    const { token, answer } = req.body;
    if (!token || !answer) return res.status(400).json({ error: 'token and answer required' });

    let data;
    try { data = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid token' }); }

    const correct  = answer === data.correct;
    const xpEarned = correct ? 50 : 10;

    await supabase.from('paper_quiz_results').insert({
      user_id: req.user.id,
      quiz_type: data.future ? 'chart' : 'news',
      symbol: data.symbol || data.ticker,
      user_answer: answer, correct_answer: data.correct,
      correct, xp_earned: xpEarned,
    }).catch(() => {});

    const defaultExplanation = data.future
      ? `${data.symbol} actually moved ${data.pct > 0 ? '+' : ''}${data.pct}% — that's a ${
          Math.abs(data.pct) <= 2 ? 'sideways' : data.pct > 0 ? 'bullish' : 'bearish'
        } move. ${data.correct === 'up' ? 'Buyers took control after the period shown.' : data.correct === 'down' ? 'Sellers took control after the period shown.' : 'The stock consolidated near its recent levels.'}`
      : '';

    res.json({
      correct, correctAnswer: data.correct,
      explanation: data.explanation || defaultExplanation,
      futureData: data.future || null,
      pctChange: data.pct ?? null,
      xpEarned,
    });
  } catch (err) {
    console.error('[/trading/quiz/answer]', err);
    res.status(500).json({ error: 'Answer check failed' });
  }
});

// ── GET /stats ────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { data: qr } = await supabase.from('paper_quiz_results').select('correct').eq('user_id', req.user.id);
    const { count: tc } = await supabase.from('paper_trades').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
    const total  = qr?.length || 0;
    const right  = qr?.filter(q => q.correct).length || 0;
    res.json({ quizTotal: total, quizCorrect: right, quizPct: total > 0 ? Math.round(right / total * 100) : 0, tradeCount: tc || 0 });
  } catch { res.status(500).json({ error: 'Failed to load stats' }); }
});

export default router;
