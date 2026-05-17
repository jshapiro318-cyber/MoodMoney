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

function buildScenario({ seed, startPrice, histDays, trendPct, futureTrendPct, symbol, name, keyLesson, pattern, marketContext, technicalSetup }) {
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

  // Support = lowest close in recent 15% of history; Resistance = period high
  const recentWindow = Math.max(5, Math.floor(histDays * 0.15));
  const support      = +Math.min(...closes.slice(-recentWindow)).toFixed(2);
  const resistance   = high;

  // Risk/reward: distance to support vs resistance from last close
  const distDown  = +(((lastClose - support)     / lastClose) * 100).toFixed(1);
  const distUp    = +(((resistance - lastClose)   / lastClose) * 100).toFixed(1);
  const rrRatio   = distDown > 0 ? +(distUp / distDown).toFixed(1) : '—';

  const explanation = correct === 'up'
    ? `${name} gained ${pct}% over the next 5 sessions. ${periodPct >= 0 ? 'The uptrend had momentum — buyers stepped in and drove price higher, confirming the trend.' : 'After the decline, buyers absorbed all the selling and staged a powerful reversal.'} The ${pattern.toLowerCase()} pattern played out exactly as it typically does.`
    : correct === 'down'
    ? `${name} fell ${Math.abs(pct)}% over the next 5 sessions. ${periodPct >= 0 ? 'The uptrend ran out of steam — sellers overwhelmed buyers near the highs as supply dried up demand.' : 'The downtrend continued as sellers maintained firm control.'} This is a textbook outcome for the ${pattern.toLowerCase()} pattern.`
    : `${name} moved just ${pct >= 0 ? '+' : ''}${pct}% — essentially flat. Neither buyers nor sellers had conviction; the stock continued consolidating in a tight range. Sideways action often precedes a larger move — the breakout direction is the key tell.`;

  return {
    type: 'chart', symbol, name, history, future, correct, pct,
    pattern, marketContext, technicalSetup,
    support, resistance, rrRatio,
    stats: { periodReturn: periodPct, periodHigh: high, periodLow: low, currentPrice: lastClose, pctFromHigh, volumeTrend: volTrend, daysShown: histDays },
    hints: [
      `Trend: ${periodPct >= 0 ? '+' : ''}${periodPct}% — ${Math.abs(periodPct) > 10 ? 'strong move, momentum is a factor' : Math.abs(periodPct) > 3 ? 'moderate trend in place' : 'mostly flat — no clear directional bias'}`,
      `Volume: ${volTrend} — ${volTrend === 'increasing' ? 'rising volume confirms the move. Money is flowing in.' : volTrend === 'decreasing' ? 'falling volume = weakening conviction. Watch for a reversal.' : 'steady volume — neither bulls nor bears are dominant'}`,
      pctFromHigh < -15 ? `Price is ${Math.abs(pctFromHigh)}% below the period high. Heavy overhead supply = strong resistance to recovery` : pctFromHigh < -5 ? `Price is ${Math.abs(pctFromHigh)}% off the high. That level acts as resistance — breaking above it would be bullish` : 'Price is near its recent high. Watch for a breakout above (bullish) or rejection (bearish)',
    ],
    question: `${name} (${symbol}) — ${Math.abs(periodPct)}% ${periodPct >= 0 ? 'gain' : 'drop'} shown. Where does it go next?`,
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
    buildScenario({
      seed:1, startPrice:450, histDays:40, trendPct:0.12, futureTrendPct:0.09,
      symbol:'NVDA', name:'NVIDIA Corp',
      pattern: 'Strong Uptrend',
      marketContext: 'NVIDIA has been on a relentless run driven by insatiable demand for AI chips. Every pullback gets bought. Institutions are accumulating and retail is chasing. Volume spikes on up days confirm the trend.',
      technicalSetup: 'Clean higher highs and higher lows. Price is above both the 20-day and 50-day moving averages. Momentum is strong — RSI is elevated but not yet extended. This is the classic "buy the dip" setup professionals look for.',
      keyLesson: 'The trend is your friend. Strong uptrends with rising volume signal institutional buying. "Follow the smart money" — don\'t fade a stock that institutions are clearly accumulating.',
    }),
    buildScenario({
      seed:2, startPrice:285, histDays:38, trendPct:0.06, futureTrendPct:-0.09,
      symbol:'TSLA', name:'Tesla Inc',
      pattern: 'Distribution Top',
      marketContext: 'Tesla ran hard after strong delivery numbers, but the fundamental catalyst is now priced in. Volume on up-days is declining while down-days show heavier selling. Smart money is quietly unloading.',
      technicalSetup: 'The stock has made a series of smaller highs while volume trends down — a classic distribution pattern. Price is near the top of the range with weakening momentum. When a stock can\'t make new highs despite positive news, it\'s a warning sign.',
      keyLesson: 'When big money sells INTO strength, volume on up-days dries up while down-days see heavier selling. This distribution pattern often precedes a sharp breakdown. Never confuse a slow, grinding top with consolidation.',
    }),
    buildScenario({
      seed:3, startPrice:175, histDays:35, trendPct:0.01, futureTrendPct:0.01,
      symbol:'AAPL', name:'Apple Inc',
      pattern: 'Tight Consolidation Base',
      marketContext: 'Apple is in a holding pattern after a big move. The market is waiting for a new catalyst — iPhone cycle data, services growth numbers, or macro news. Neither bulls nor bears have conviction.',
      technicalSetup: 'Price is moving in a very tight range — less than 5% from high to low over the period. Volume is below average. This kind of tight coiling often precedes a significant move. The breakout direction will depend on the next catalyst.',
      keyLesson: 'Tight consolidation bases are like a coiled spring. The longer and tighter the base, the bigger the eventual move. Watch for a volume expansion on the breakout day — that\'s the signal that big money is moving in.',
    }),
    buildScenario({
      seed:4, startPrice:120, histDays:36, trendPct:-0.12, futureTrendPct:0.09,
      symbol:'META', name:'Meta Platforms',
      pattern: 'V-Shape Recovery',
      marketContext: 'Meta got crushed after disappointing earnings guidance, but the selloff has been relentless — everyone who wanted to sell has already sold. Now the bad news is "priced in" and buyers see an opportunity.',
      technicalSetup: 'After a steep decline, volume is drying up on down-days while up-days are starting to see bigger candles. This exhaustion pattern signals the selling is done. The risk/reward favors the bulls — limited downside, significant upside to previous highs.',
      keyLesson: 'V-shape recoveries happen when bad news gets over-priced. When a stock falls 15%+ and volume collapses on the last few down days, sellers are exhausted. The bounce can be violent — stocks often recover 50%+ of the decline in just a few sessions.',
    }),
    buildScenario({
      seed:5, startPrice:380, histDays:37, trendPct:0.28, futureTrendPct:-0.09,
      symbol:'COIN', name:'Coinbase Global',
      pattern: 'Parabolic Blow-Off Top',
      marketContext: 'Coinbase has gone nearly vertical in a crypto mania phase. Everyone is buying because "it keeps going up." But parabolic moves always end the same way — when there are no more buyers left, gravity takes over.',
      technicalSetup: 'The angle of ascent is unsustainable — price is +28% in 37 days with accelerating gains in the final stretch. RSI would be deeply overbought. Volume is spiking on late-stage rallies as retail chases. This is textbook blow-off top territory.',
      keyLesson: 'Parabolic moves ALWAYS correct. A 45-degree chart turns into 90-degree, then collapses. The exact top is impossible to call, but the pattern is clear. "The last 20% of a move comes from amateurs, not pros." Never chase a vertical chart.',
    }),
    buildScenario({
      seed:6, startPrice:65, histDays:40, trendPct:0.02, futureTrendPct:0.01,
      symbol:'SNAP', name:'Snap Inc',
      pattern: 'Range-Bound Indecision',
      marketContext: 'Snap is stuck between competing narratives — advertising recovery vs. user growth concerns. Big investors are sitting on the sidelines waiting for clarity. The stock can\'t break up or down without a catalyst.',
      technicalSetup: 'Price is moving in a 4-5% range for the entire period. Volume is below average and shrinking. Both bulls and bears lack conviction. This type of low-volatility compression often explodes eventually — but timing is nearly impossible without a catalyst.',
      keyLesson: 'When a stock is truly range-bound, both bulls and bears lose. The best trade is often to wait. Traders call this "chopping" — the market takes money from both sides until a real catalyst breaks the deadlock. Patience > activity.',
    }),
    buildScenario({
      seed:7, startPrice:320, histDays:42, trendPct:0.07, futureTrendPct:0.09,
      symbol:'MSFT', name:'Microsoft Corp',
      pattern: 'Institutional Accumulation',
      marketContext: 'Microsoft is grinding higher quietly — no parabolic moves, just steady, consistent buying. Azure growth and Copilot AI monetization are slowly building the bull case. This is classic institutional accumulation.',
      technicalSetup: 'Small daily candles, steady upward drift, stable volume. Price makes higher lows consistently — each dip gets bought. This "staircase" pattern is what institutional buying looks like. It\'s boring, but boring is often very profitable.',
      keyLesson: 'Boring uptrends beat volatile moonshots for risk-adjusted returns. When a stock grinds steadily higher with stable volume and no sharp pullbacks, it means institutions are steadily accumulating. These trends last longer and have better Sharpe ratios than momentum stocks.',
    }),
    buildScenario({
      seed:8, startPrice:195, histDays:35, trendPct:0.05, futureTrendPct:-0.09,
      symbol:'AMD', name:'AMD Inc',
      pattern: 'Failed Breakout',
      marketContext: 'AMD pushed to new highs on AI chip enthusiasm, but couldn\'t hold the gains. Each attempt to break higher was met with selling. Now it looks like the breakout is failing — and failed breakouts are often powerful reversal signals.',
      technicalSetup: 'Price made a new high but closed below it (a bearish candle). The last few days show sellers appearing at the highs. Volume is declining on up-days but picking up slightly on down-days. A failed breakout often leads to a drop back to the base of the move.',
      keyLesson: 'Failed breakouts trap buyers and generate powerful reversals. When a stock makes a new high and then quickly falls back, everyone who bought the breakout is underwater and becomes a seller. "Bull traps" often fall harder than the original move — selling accelerates as trapped bulls exit.',
    }),
    buildScenario({
      seed:9, startPrice:85, histDays:38, trendPct:-0.14, futureTrendPct:0.00,
      symbol:'PLTR', name:'Palantir Technologies',
      pattern: 'Post-Decline Consolidation',
      marketContext: 'PLTR got hit hard after missing growth estimates. The initial panic selling is done, but there\'s no obvious catalyst to drive a recovery. The stock is in "no man\'s land" — too beaten up to chase but not cheap enough to be a screaming buy.',
      technicalSetup: 'After a sharp 14% decline, price has stabilized but without conviction. Each small bounce gets sold into. Volume is low — the selling pressure has paused but buyers aren\'t stepping up either. This is a "show me" situation for investors.',
      keyLesson: 'After a sharp decline, don\'t expect an immediate recovery. The base-building process takes time — often weeks or months. A "dead cat bounce" (quick snap-back after a drop) can fool people into thinking the bottom is in. Real recoveries need volume expansion and improving fundamentals.',
    }),
    buildScenario({
      seed:10, startPrice:55, histDays:40, trendPct:0.03, futureTrendPct:0.09,
      symbol:'SOFI', name:'SoFi Technologies',
      pattern: 'Flat Base Breakout Setup',
      marketContext: 'SoFi has been quietly building a flat base after a prolonged decline. Institutional interest is slowly returning as the fintech narrative recovers. The stock needs one good earnings beat or rate-cut catalyst to ignite the base.',
      technicalSetup: 'Price has traded in a flat, tight range — this is called a "flat base" in technical analysis. Volume is low during the base but starting to tick up. The stock is coiling for a move. A breakout above the range on heavy volume would signal the launch of a new upleg.',
      keyLesson: 'Flat bases are launching pads. When a stock consolidates tightly after a big decline, it means the weak holders have been shaken out and a new buyer base is forming. The breakout from a flat base — on 2x+ average volume — is one of the highest-probability trade setups in the market.',
    }),
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
