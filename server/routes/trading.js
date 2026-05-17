import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
// Share stocks.js's YF instance + rate limiter — one connection, no competing requests
import { stocksCache, yfChart } from './stocks.js';

const router = Router();

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

// ── Price helpers ─────────────────────────────────────────────────────────────
// All price lookups go through stocks.js's shared yfChart (one rate limiter).
// Cache is checked first so featured stocks cost zero YF calls.

function getCachedPrice(symbol) {
  const simple   = stocksCache.simple.data?.find(s => s.symbol === symbol);
  if (simple)   return simple.price;
  const detailed = stocksCache.detailed.data?.find(s => s.symbol === symbol);
  if (detailed) return detailed.price;
  return null;
}

async function fetchLivePrice(symbol) {
  // 1. Cache — free, instant
  const cached = getCachedPrice(symbol);
  if (cached) return cached;

  // 2. Shared yfChart from stocks.js (same instance, same 80ms rate limiter)
  try {
    const chart  = await yfChart(symbol, 5);
    const price  = chart?.meta?.regularMarketPrice;
    if (price)   return +price.toFixed(2);
    // Market closed — regularMarketPrice may be absent, use last close
    const closes = (chart?.quotes || []).map(q => q.close).filter(Boolean);
    if (closes.length) return +closes.at(-1).toFixed(2);
  } catch (e) {
    console.warn(`[trading] fetchLivePrice(${symbol}):`, e.message);
  }
  return null;
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

// ── Chart quiz — static pre-built scenarios (no Yahoo Finance needed) ─────────
// Using seeded pseudo-random data so scenarios are deterministic & consistent.
// 10 scenarios covering different market patterns across real stock names.

function seededRandom(seed) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tradingDatesBack(totalNeeded) {
  // Return the last `totalNeeded` trading days (Mon–Fri) up to today
  const dates = [];
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  for (let back = 1; dates.length < totalNeeded; back++) {
    const dt = new Date(d.getTime() - back * 86400000);
    if (dt.getUTCDay() !== 0 && dt.getUTCDay() !== 6) dates.unshift(dt.toISOString().split('T')[0]);
  }
  return dates;
}

function buildScenario({ seed, startPrice, histDays, trendPct, futureTrendPct, symbol, name, keyLesson }) {
  const rand = seededRandom(seed);
  const allPrices = [];
  let price = startPrice;
  for (let i = 0; i < histDays + 5; i++) {
    const isHist = i < histDays;
    const drift  = (isHist ? trendPct / histDays : futureTrendPct / 5) + (rand() - 0.5) * 0.012;
    price = Math.max(1, price * (1 + drift));
    allPrices.push(+price.toFixed(2));
  }
  const dates      = tradingDatesBack(histDays + 5);
  const histPrices = allPrices.slice(0, histDays);
  const futPrices  = allPrices.slice(histDays);
  const history = histPrices.map((close, i) => ({
    date: dates[i], close,
    volume: Math.floor((0.7 + 0.3 * rand()) * 45_000_000),
  }));
  const future = futPrices.map((close, i) => ({ date: dates[histDays + i], close }));

  const lastClose  = history.at(-1).close;
  const endClose   = future.at(-1).close;
  const pct        = +((endClose - lastClose) / lastClose * 100).toFixed(2);
  const correct    = pct > 2 ? 'up' : pct < -2 ? 'down' : 'neutral';
  const periodPct  = +((lastClose - history[0].close) / history[0].close * 100).toFixed(2);
  const closes     = history.map(h => h.close);
  const high       = +Math.max(...closes).toFixed(2);
  const low        = +Math.min(...closes).toFixed(2);
  const vols       = history.map(h => h.volume);
  const recentAvg  = vols.slice(-5).reduce((a, b) => a + b, 0) / 5 || 1;
  const olderAvg   = vols.slice(-15, -5).reduce((a, b) => a + b, 0) / 10 || recentAvg;
  const volTrend   = recentAvg > olderAvg * 1.15 ? 'increasing' : recentAvg < olderAvg * 0.85 ? 'decreasing' : 'stable';
  const pctFromHigh = +(((lastClose - high) / high) * 100).toFixed(1);

  const explanation = correct === 'up'
    ? `${name} gained ${pct}% over the next 5 sessions. ${periodPct >= 0 ? 'The uptrend had momentum — buyers stepped in and drove price higher.' : 'After the decline, buyers absorbed all the selling and reversed the trend.'}`
    : correct === 'down'
    ? `${name} fell ${Math.abs(pct)}% over the next 5 sessions. ${periodPct >= 0 ? 'The uptrend ran out of steam — sellers overwhelmed buyers near the highs.' : 'The downtrend continued as sellers maintained control.'}`
    : `${name} moved just ${pct >= 0 ? '+' : ''}${pct}% — essentially flat. Neither buyers nor sellers had conviction; the stock continued to consolidate.`;

  return {
    type: 'chart', symbol, name, history, future, correct, pct,
    stats: { periodReturn: periodPct, periodHigh: high, periodLow: low, currentPrice: lastClose, pctFromHigh, volumeTrend: volTrend, daysShown: histDays },
    hints: [
      `Trend over period: ${periodPct >= 0 ? '+' : ''}${periodPct}% — ${Math.abs(periodPct) > 10 ? 'strong directional move' : Math.abs(periodPct) > 3 ? 'moderate trend' : 'mostly flat'}`,
      `Volume is ${volTrend} — ${volTrend === 'increasing' ? 'rising volume confirms the trend direction' : volTrend === 'decreasing' ? 'falling volume may signal weakening momentum' : 'steady volume — market is undecided'}`,
      pctFromHigh < -15 ? 'Price is well below its recent high — large supply overhead, recovery faces resistance' : pctFromHigh < -5 ? `Price is ${Math.abs(pctFromHigh)}% below the period high — watch that level as resistance` : 'Price is near its recent high — watch for either breakout or rejection',
    ],
    question: `${name} — ${Math.abs(periodPct)}% ${periodPct >= 0 ? 'gain' : 'drop'} shown. Where does it go next?`,
    options: [
      { value: 'up',      label: '📈 Up',      desc: '> +2% in 5 days' },
      { value: 'down',    label: '📉 Down',     desc: '< -2% in 5 days' },
      { value: 'neutral', label: '↔️ Sideways', desc: 'Within ±2%'      },
    ],
    explanation, keyLesson,
    token: Buffer.from(JSON.stringify({ symbol, name, correct, future, lastClose, endClose, pct })).toString('base64'),
  };
}

// Pre-built scenarios — regenerated fresh on each server start so dates are always current
function buildAllScenarios() {
  return [
    buildScenario({ seed:1,  startPrice:450, histDays:40, trendPct: 0.12, futureTrendPct: 0.09, symbol:'NVDA', name:'NVIDIA Corp',
      keyLesson:'Strong uptrends tend to continue. Rising volume on up-days confirms institutions are buying — "follow the smart money."' }),
    buildScenario({ seed:2,  startPrice:285, histDays:38, trendPct: 0.06, futureTrendPct:-0.09, symbol:'TSLA', name:'Tesla Inc',
      keyLesson:'When a stock stalls near its highs after a run, watch for distribution. Big money sells INTO strength — declining volume on up-days is the warning sign.' }),
    buildScenario({ seed:3,  startPrice:175, histDays:35, trendPct: 0.01, futureTrendPct: 0.01, symbol:'AAPL', name:'Apple Inc',
      keyLesson:'Sideways consolidation after a move is healthy — the market is digesting gains. The longer and tighter the base, the more powerful the eventual breakout.' }),
    buildScenario({ seed:4,  startPrice:120, histDays:36, trendPct:-0.12, futureTrendPct: 0.09, symbol:'META', name:'Meta Platforms',
      keyLesson:'Sharp declines create buying opportunities. When bad news is fully priced in and selling volume dries up, powerful reversals follow. Volume spikes on reversal days confirm the turn.' }),
    buildScenario({ seed:5,  startPrice:380, histDays:37, trendPct: 0.28, futureTrendPct:-0.09, symbol:'COIN', name:'Coinbase Global',
      keyLesson:'Parabolic moves always end in corrections. A vertical chart means the stock has run out of new buyers — when selling starts, there\'s no support. Never chase a vertical chart.' }),
    buildScenario({ seed:6,  startPrice:65,  histDays:40, trendPct: 0.02, futureTrendPct: 0.01, symbol:'SNAP', name:'Snap Inc',
      keyLesson:'Choppy, range-bound trading reflects indecision. Traders wait for a catalyst. No clear trend = sit on the sidelines or make small trades until a direction emerges.' }),
    buildScenario({ seed:7,  startPrice:320, histDays:42, trendPct: 0.07, futureTrendPct: 0.09, symbol:'MSFT', name:'Microsoft Corp',
      keyLesson:'Steady, consistent uptrends with stable volume signal institutional accumulation. Slow and steady often beats volatile and fast — these trends last longer and have cleaner entries.' }),
    buildScenario({ seed:8,  startPrice:195, histDays:35, trendPct: 0.05, futureTrendPct:-0.09, symbol:'AMD',  name:'AMD Inc',
      keyLesson:'Small uptrends can fail at key resistance. When a stock struggles to hold gains and higher highs come with lower volume, distribution is likely. Protect profits near resistance.' }),
    buildScenario({ seed:9,  startPrice:85,  histDays:38, trendPct:-0.14, futureTrendPct: 0.00, symbol:'PLTR', name:'Palantir Technologies',
      keyLesson:'After a big decline, stocks often consolidate before recovering. "Dead cat bounces" happen — a brief rally followed by continued weakness. Wait for a proper base to form.' }),
    buildScenario({ seed:10, startPrice:55,  histDays:40, trendPct: 0.03, futureTrendPct: 0.09, symbol:'SOFI', name:'SoFi Technologies',
      keyLesson:'Flat bases after declines signal accumulation. When buying pressure finally outweighs selling, the breakout can be explosive. Watch for volume to expand on the breakout day.' }),
  ];
}

// Build once at startup — uses current dates so the chart always looks recent
const CHART_SCENARIOS = buildAllScenarios();
console.log(`[trading] ${CHART_SCENARIOS.length} chart quiz scenarios ready (no YF needed)`);

// ── GET /quiz ─────────────────────────────────────────────────────────────────

const NEWS_SCENARIOS = [
  {
    headline: 'Fed announces surprise 0.50% rate cut — cites slowing economic growth',
    ticker: 'JPM', correct: 'up',
    context: 'The Federal Reserve sets the "cost of money." When rates drop, banks can borrow cheap and lend at higher rates — their core profit engine.',
    sectors: ['Finance', 'Real Estate', 'Utilities'],
    why: 'Rate cuts reduce borrowing costs and boost loan demand. Banks like JPMorgan typically rally on dovish Fed pivots — cheaper capital = wider net interest margins.',
    keyLesson: 'Rate cuts → bullish for rate-sensitive sectors (banks, real estate, utilities). Rate hikes → bearish for those same sectors.',
  },
  {
    headline: 'NVIDIA crushes earnings — beats by 48%, raises full-year guidance',
    ticker: 'NVDA', correct: 'up',
    context: 'Earnings season is when companies report their actual profits. A 48% beat means they made nearly DOUBLE what Wall Street predicted.',
    sectors: ['Tech', 'AI/Chips', 'Data Centers'],
    why: 'A massive earnings beat + raised guidance signals insatiable AI chip demand. Analysts upgrade their price targets and momentum traders pile in.',
    keyLesson: 'Earnings beats = instant price catalyst. Bigger the beat, bigger the move. "Guidance" (future outlook) matters even more than the current results.',
  },
  {
    headline: 'US announces sweeping 30% tariffs on all Chinese tech imports',
    ticker: 'AAPL', correct: 'down',
    context: 'Tariffs are taxes on imported goods. Companies either absorb the cost (hurting profits) or pass it to consumers (hurting sales). Both are bad.',
    sectors: ['Tech', 'Consumer Electronics', 'Retail'],
    why: 'Apple assembles most iPhones in China. Heavy tariffs mean margin compression or price hikes — either way, profits take a hit.',
    keyLesson: 'Supply chain exposure to tariffed countries = direct risk. Check where a company manufactures before investing.',
  },
  {
    headline: 'Bitcoin crashes 35% overnight after SEC bans all crypto spot ETFs',
    ticker: 'COIN', correct: 'down',
    context: 'Coinbase makes money from trading fees. When crypto crashes, people stop trading — and Coinbase\'s revenue crashes with it.',
    sectors: ['Crypto', 'Finance', 'Fintech'],
    why: 'Coinbase revenue is directly tied to crypto trading volume. A 35% crash kills transaction fees instantly — their income falls in real time.',
    keyLesson: 'Look for companies that make money when an asset moves (exchanges, brokers) — they\'re riskier than owning the asset itself.',
  },
  {
    headline: 'Amazon announces 20,000 layoffs and a $15B share buyback',
    ticker: 'AMZN', correct: 'up',
    context: 'Buybacks reduce the number of shares outstanding, making each remaining share worth more of the company. Wall Street loves them.',
    sectors: ['Tech', 'E-Commerce', 'Cloud'],
    why: 'Wall Street loves cost discipline + buybacks. Fewer shares + lower costs = higher earnings per share. Investors bid the stock up.',
    keyLesson: 'Layoffs + buybacks often signal management is prioritizing profitability over growth — that\'s bullish in a tough market.',
  },
  {
    headline: 'Google loses landmark antitrust case — judge orders search ad unit spinoff',
    ticker: 'GOOGL', correct: 'down',
    context: 'Antitrust cases can force companies to break up their most profitable divisions. Google\'s search ads are ~60% of Alphabet\'s total revenue.',
    sectors: ['Tech', 'Advertising', 'Media'],
    why: 'Losing the search ad business would permanently destroy Alphabet\'s core earnings engine. The market prices this in immediately.',
    keyLesson: 'Regulatory risk is real. Monopoly-adjacent businesses face the biggest antitrust exposure — always worth tracking ongoing legal cases.',
  },
  {
    headline: 'Microsoft wins $12B Pentagon AI contract for cloud + generative AI',
    ticker: 'MSFT', correct: 'up',
    context: 'Government contracts = guaranteed recurring revenue, often for 5-10 years. The Pentagon deal validates Microsoft as the AI infrastructure leader.',
    sectors: ['Tech', 'Cloud', 'Defense'],
    why: 'Big gov contracts add predictable revenue and validate Azure\'s AI leadership — Wall Street re-rates the stock higher.',
    keyLesson: 'Government contract wins signal market dominance. Unlike consumer deals, they\'re multi-year, inflation-adjusted, and nearly impossible to cancel.',
  },
  {
    headline: 'Tesla recalls 500,000 vehicles over critical autopilot software defect',
    ticker: 'TSLA', correct: 'down',
    context: 'Tesla\'s entire valuation premium relies on the narrative that it\'s a tech/AI company, not just a car company. FSD (Full Self-Driving) is central to that story.',
    sectors: ['Auto', 'Tech', 'EV'],
    why: 'Recalls are expensive AND they damage the "autonomous driving leader" narrative that justifies Tesla\'s 50x+ P/E premium over traditional automakers.',
    keyLesson: 'Growth stocks trade on narrative. When the core story is challenged (FSD safety issues), the valuation premium compresses fast.',
  },
  {
    headline: 'Oil surges 20% after OPEC+ announces surprise production cuts',
    ticker: 'XOM', correct: 'up',
    context: 'OPEC+ controls ~40% of global oil supply. Cutting production with constant demand = prices go up. Simple supply & demand.',
    sectors: ['Energy', 'Oil & Gas', 'Commodities'],
    why: 'Exxon\'s revenue is directly proportional to oil prices. Higher crude = wider profit margins across every barrel they produce and sell.',
    keyLesson: 'Commodity producers (oil, gas, gold miners) move in direct correlation with the underlying commodity price. Know the commodity, know the stock.',
  },
  {
    headline: 'Meta announces AI ad targeting doubles click-through rates in tests',
    ticker: 'META', correct: 'up',
    context: 'Meta\'s business model: charge advertisers for attention. Better AI targeting means ads perform better, which means brands pay MORE to run ads.',
    sectors: ['Tech', 'Advertising', 'Social Media'],
    why: 'Better targeting = higher CPMs = advertisers spend more on Meta = revenue acceleration. This directly hits Meta\'s core profit driver.',
    keyLesson: 'For ad-supported businesses, targeting efficiency IS the product. Any improvement translates directly to higher ad prices and revenue.',
  },
];

router.get('/quiz', async (req, res) => {
  try {
    const type = req.query.type === 'news' ? 'news' : 'chart';

    if (type === 'chart') {
      // Pick a random pre-built scenario — instant, zero Yahoo Finance calls
      const s = CHART_SCENARIOS[Math.floor(Math.random() * CHART_SCENARIOS.length)];
      return res.json(s);
    } else {
      const s = NEWS_SCENARIOS[Math.floor(Math.random() * NEWS_SCENARIOS.length)];
      res.json({
        type: 'news',
        headline: s.headline,
        ticker: s.ticker,
        context: s.context,
        sectors: s.sectors,
        keyLesson: s.keyLesson,
        question: `How does ${s.ticker} react to this news?`,
        options: [
          { value: 'up',      label: '📈 Stock goes UP',   desc: 'Bullish catalyst — price rises' },
          { value: 'down',    label: '📉 Stock goes DOWN',  desc: 'Bearish catalyst — price falls' },
          { value: 'neutral', label: '↔️ Barely moves',     desc: 'Already priced in or mixed signals' },
        ],
        token: Buffer.from(JSON.stringify({
          correct: s.correct, explanation: s.why, keyLesson: s.keyLesson,
          ticker: s.ticker, headline: s.headline,
        })).toString('base64'),
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

    // Fire-and-forget DB log — do NOT await (avoids Vercel 30s timeout if table is slow)
    setImmediate(() => {
      supabase.from('paper_quiz_results').insert({
        user_id: req.user.id,
        quiz_type: data.future ? 'chart' : 'news',
        symbol: data.symbol || data.ticker || 'unknown',
        user_answer: answer,
        correct_answer: data.correct,
        correct,
        xp_earned: xpEarned,
      }).catch(() => {});
    });

    const defaultExplanation = data.future
      ? `${data.symbol} actually moved ${data.pct > 0 ? '+' : ''}${data.pct}% over those 5 days — ${
          Math.abs(data.pct) <= 2 ? 'a sideways consolidation' : data.pct > 0 ? 'a bullish breakout' : 'a bearish breakdown'
        }. ${data.correct === 'up' ? 'Buyers stepped in and pushed price higher.' : data.correct === 'down' ? 'Sellers took control and drove price lower.' : 'The stock digested its recent move without a clear direction.'}`
      : '';

    res.json({
      correct,
      correctAnswer: data.correct,
      explanation: data.explanation || defaultExplanation,
      keyLesson: data.keyLesson || null,
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
