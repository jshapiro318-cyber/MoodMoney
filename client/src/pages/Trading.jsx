import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────
function fmt$(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}
function fmtBig(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return fmt$(n);
}
function fmtPct(n) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function SectionLabel({ children }) {
  return <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-1.5">{children}</p>;
}

// ─── Market hours check (ET) ──────────────────────────────────────────────────
function getMarketStatus() {
  const now = new Date();
  // Determine ET offset (EDT = UTC-4, EST = UTC-5)
  // Simple rule: EDT runs Mar-Nov (approximate), EST Nov-Mar
  const month = now.getUTCMonth(); // 0=Jan
  const etOffset = (month >= 2 && month <= 10) ? -4 : -5;
  const et = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
  const day = et.getDay();       // 0=Sun,6=Sat
  const h   = et.getHours();
  const m   = et.getMinutes();
  const t   = h * 100 + m;

  const isWeekend = day === 0 || day === 6;
  const isOpen    = !isWeekend && t >= 930 && t < 1600;

  let nextOpen = '';
  if (isOpen) {
    nextOpen = '';
  } else if (day === 5 && t >= 1600) {      // Friday after close
    nextOpen = 'Monday 9:30 AM ET';
  } else if (day === 6) {                   // Saturday
    nextOpen = 'Monday 9:30 AM ET';
  } else if (day === 0) {                   // Sunday
    nextOpen = 'Monday 9:30 AM ET';
  } else if (t < 930) {                     // Weekday pre-market
    nextOpen = 'Today at 9:30 AM ET';
  } else {                                  // Weekday after close
    nextOpen = 'Tomorrow at 9:30 AM ET';
  }
  return { isOpen, nextOpen };
}
function HR() { return <div className="h-px bg-surface-700 my-4" />; }
function Badge({ children, variant = 'zinc' }) {
  const v = {
    green:  'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    red:    'bg-red-500/12    text-red-400    border-red-500/25',
    yellow: 'bg-amber-500/12  text-amber-400  border-amber-500/25',
    purple: 'bg-purple-500/12 text-purple-400 border-purple-500/25',
    brand:  'bg-brand-500/12  text-brand-400  border-brand-500/25',
    zinc:   'bg-surface-700   text-surface-400 border-surface-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${v[variant] || v.zinc}`}>
      {children}
    </span>
  );
}
function Loader({ title, sub }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-surface-700" />
        <motion.div className="absolute inset-0 rounded-full border-2 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
function Err({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm font-semibold text-white max-w-xs leading-snug">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="px-5 py-2 rounded-xl bg-surface-800 border border-surface-600 text-xs font-bold hover:border-surface-500 transition-colors">
          Try again
        </button>
      )}
    </div>
  );
}

// ─── Mini sparkline chart for quiz ───────────────────────────────────────────
function QuizChart({ data, future, revealed, positive }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const allData   = revealed && future ? [...data, ...future] : data;
  const splitIdx  = data.length - 1;
  const closes    = allData.map(d => d.close);
  const minV      = Math.min(...closes);
  const maxV      = Math.max(...closes);
  const rangeV    = maxV - minV || 1;
  const W = 320, H = 130, PT = 10, PR = 4, PB = 22, PL = 0;

  const xp = i => PL + (i / (allData.length - 1)) * (W - PL - PR);
  const yp = v => PT + (1 - (v - minV) / rangeV) * (H - PT - PB);

  const histPts   = data.map((d, i) => `${xp(i)},${yp(d.close)}`).join(' ');
  const futurePts = revealed && future
    ? [data.at(-1), ...future].map((d, i) => `${xp(splitIdx + i)},${yp(d.close)}`).join(' ')
    : null;

  const areaD = `M${xp(0)},${yp(data[0].close)} ` +
    data.slice(1).map((d, i) => `L${xp(i + 1)},${yp(d.close)}`).join(' ') +
    ` L${xp(splitIdx)},${H - PB} L${xp(0)},${H - PB} Z`;

  const mainColor   = positive ? '#22c55e' : '#ef4444';
  const futureColor = revealed && future
    ? (future.at(-1).close >= data.at(-1).close ? '#22c55e' : '#ef4444')
    : '#6366f1';

  function onMove(e) {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = ((cx - rect.left) / rect.width) * W;
    const raw = (relX - PL) / (W - PL - PR) * (allData.length - 1);
    const i = Math.max(0, Math.min(allData.length - 1, Math.round(raw)));
    setHover({ i, cx: xp(i), cy: yp(allData[i].close), d: allData[i], isFuture: i > splitIdx });
  }

  return (
    <div className="relative w-full select-none">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
        style={{ touchAction: 'none' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
        <defs>
          <linearGradient id="qg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mainColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={mainColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#qg)" />
        <polyline fill="none" stroke={mainColor} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" points={histPts} />
        {/* Divider line */}
        {revealed && future && (
          <line x1={xp(splitIdx)} y1={PT} x2={xp(splitIdx)} y2={H - PB}
            stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeDasharray="4,3" />
        )}
        {futurePts && (
          <polyline fill="none" stroke={futureColor} strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={revealed ? 'none' : '6,4'}
            points={futurePts} />
        )}
        {hover && (
          <>
            <line x1={hover.cx} y1={PT} x2={hover.cx} y2={H - PB}
              stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,2" />
            <circle cx={hover.cx} cy={hover.cy} r="3.5"
              fill={hover.isFuture ? futureColor : mainColor}
              stroke="#0f0f14" strokeWidth="2" />
          </>
        )}
        <text x={PL} y={H} fontSize="7.5" fill="#52525b">{data[0]?.date}</text>
        {revealed && future
          ? <text x={W - PR} y={H} fontSize="7.5" fill={futureColor} textAnchor="end">↑ revealed</text>
          : <text x={W - PR} y={H} fontSize="7.5" fill="#52525b" textAnchor="end">?</text>
        }
      </svg>
      {hover && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-surface-800 border border-surface-600 rounded-lg px-2.5 py-1.5 pointer-events-none shadow-lg text-center">
          <p className="text-xs font-black tabular-nums text-white">${hover.d.close?.toFixed(2)}</p>
          <p className="text-[9px] text-surface-500">{hover.d.date}{hover.isFuture ? ' · future' : ''}</p>
        </div>
      )}
    </div>
  );
}

// ─── Portfolio tab ────────────────────────────────────────────────────────────
function PortfolioTab({ onRefresh }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState('');
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setData(await api.getTradingPortfolio()); }
    catch (e) { setErr(e?.data?.error || 'Failed to load portfolio'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleReset() {
    setResetting(true);
    try {
      await api.resetPortfolio();
      setConfirmReset(false);
      await load();
      onRefresh?.();
    } catch (e) { alert(e?.data?.error || 'Reset failed'); }
    finally { setResetting(false); }
  }

  if (loading) return <Loader title="Loading portfolio…" />;
  if (err) return <Err message={err} onRetry={load} />;
  if (!data) return null;

  const pos = data.totalReturn >= 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Summary card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-surface-800 border border-surface-700 rounded-2xl p-5">
        <SectionLabel>Portfolio Value</SectionLabel>
        <p className="text-4xl font-black tabular-nums tracking-tight mb-1">{fmt$(data.totalValue)}</p>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
            {pos ? '+' : ''}{fmt$(data.totalReturn)} ({fmtPct(data.totalReturnPct)})
          </span>
          <span className="text-xs text-surface-600">vs $100,000 start</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="bg-surface-900 border border-surface-700 rounded-xl p-3">
            <SectionLabel>Cash</SectionLabel>
            <p className="text-sm font-black tabular-nums text-white">{fmt$(data.cash)}</p>
          </div>
          <div className="bg-surface-900 border border-surface-700 rounded-xl p-3">
            <SectionLabel>Invested</SectionLabel>
            <p className="text-sm font-black tabular-nums text-white">
              {fmt$(data.totalValue - data.cash)}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Positions */}
      {data.positions.length > 0 && (
        <>
          <SectionLabel>Holdings · {data.positions.length} position{data.positions.length !== 1 ? 's' : ''}</SectionLabel>
          {data.positions.map((p, i) => {
            const pg = p.unrealized != null ? p.unrealized >= 0 : true;
            return (
              <motion.div key={p.symbol} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-surface-800 border border-surface-700 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-black text-base tracking-tight">{p.symbol}</p>
                    <p className="text-[10px] text-surface-500">
                      {p.shares} shares · avg {fmt$(p.avgCost)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm tabular-nums">
                      {p.currentValue ? fmt$(p.currentValue) : fmt$(p.costBasis)}
                    </p>
                    {p.currentPrice && (
                      <p className="text-[10px] text-surface-500">${p.currentPrice?.toFixed(2)}/sh</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <Badge variant={pg ? 'green' : 'red'}>
                      {p.unrealized != null ? `${pg ? '+' : ''}${fmt$(p.unrealized)}` : '—'}
                    </Badge>
                    {p.unrealizedPct != null && (
                      <Badge variant={pg ? 'green' : 'red'}>{fmtPct(p.unrealizedPct)}</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-surface-600">Cost {fmt$(p.costBasis)}</p>
                </div>
              </motion.div>
            );
          })}
        </>
      )}

      {data.positions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">💼</p>
          <p className="text-sm font-semibold text-white">No positions yet</p>
          <p className="text-xs text-surface-500 mt-1">Head to the Trade tab to buy your first stock</p>
        </div>
      )}

      <HR />

      {/* Reset */}
      <div className="bg-surface-800 border border-surface-700 rounded-2xl p-4">
        <SectionLabel>Danger Zone</SectionLabel>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            className="w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/8 transition-colors">
            🗑 Reset Portfolio to $100,000
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-surface-400 text-center">This wipes all positions and trade history. Are you sure?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)}
                className="flex-1 py-2 rounded-xl bg-surface-900 border border-surface-700 text-xs font-bold text-surface-400">
                Cancel
              </button>
              <button onClick={handleReset} disabled={resetting}
                className="flex-1 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold disabled:opacity-50">
                {resetting ? 'Resetting…' : 'Yes, reset'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-surface-600 text-center px-4">
        ⚠️ Paper trading uses real market prices but no real money. For educational use only.
      </p>
    </div>
  );
}

// ─── Market closed warning modal ─────────────────────────────────────────────
function MarketClosedModal({ nextOpen, onProceed, onCancel }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto bg-surface-800 border border-amber-500/30 rounded-3xl p-6 shadow-2xl">
        <div className="text-center mb-5">
          <span className="text-4xl">🔔</span>
          <h3 className="text-lg font-black text-white mt-3 mb-1">Market is Closed</h3>
          <p className="text-sm text-surface-400 leading-relaxed">
            Real markets aren't trading right now. Opens <span className="text-amber-400 font-bold">{nextOpen}</span>.
          </p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 mb-5">
          <p className="text-xs text-amber-300 leading-relaxed text-center">
            📌 Paper trades always execute at the <span className="font-bold">last known price</span>, not the market-open price. Your real order would be filled when trading resumes.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-surface-900 border border-surface-700 text-sm font-bold text-surface-400 hover:text-white">
            Cancel
          </button>
          <button onClick={onProceed}
            className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-black active:scale-[0.98] transition-all">
            Trade Anyway
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ─── Trade tab ────────────────────────────────────────────────────────────────
function TradeTab() {
  const [action, setAction]       = useState('buy');
  const [symbol, setSymbol]       = useState('');
  const [shares, setShares]       = useState('');
  const [liveData, setLiveData]   = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [trading, setTrading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [err, setErr]             = useState('');
  const [showClosedWarning, setShowClosedWarning] = useState(false);
  const priceTimer = useRef(null);
  const [portfolio, setPortfolio] = useState(null);

  useEffect(() => {
    api.getTradingPortfolio().then(setPortfolio).catch(() => {});
  }, [result]);

  function onSymbolChange(v) {
    setSymbol(v.toUpperCase()); setLiveData(null); setErr(''); setResult(null);
    clearTimeout(priceTimer.current);
    if (!v.trim()) return;
    priceTimer.current = setTimeout(() => fetchPrice(v.toUpperCase().trim()), 700);
  }

  async function fetchPrice(sym) {
    setPriceLoading(true);
    try { setLiveData(await api.getTradingPrice(sym)); }
    catch (e) { setErr(e?.data?.error || `Could not find price for "${sym}"`); }
    finally { setPriceLoading(false); }
  }

  const qty       = parseFloat(shares) || 0;
  const orderTotal = liveData ? +(liveData.price * qty).toFixed(2) : null;
  const canTrade  = liveData && qty > 0 && !trading;

  async function submitTrade() {
    if (!canTrade) return;
    // Warn if market is closed (only for buy — sell always goes through)
    const { isOpen, nextOpen } = getMarketStatus();
    if (!isOpen && action === 'buy' && !showClosedWarning) {
      setShowClosedWarning(true);
      return;
    }
    setShowClosedWarning(false);
    await executeTrade();
  }

  async function executeTrade() {
    setTrading(true); setErr(''); setResult(null);
    try {
      const r = await api.executeTrade(symbol.trim(), action, qty);
      setResult(r);
      setShares('');
      setLiveData(null);
      setSymbol('');
    } catch (e) { setErr(e?.data?.error || 'Trade failed'); }
    finally { setTrading(false); }
  }

  const { isOpen: mktOpen, nextOpen } = getMarketStatus();

  return (
    <div className="flex flex-col gap-4">
      {/* Market status banner */}
      {!mktOpen && (
        <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2.5">
          <span className="text-base">🔔</span>
          <p className="text-xs text-amber-300">
            <span className="font-bold">Market closed</span> · Opens {nextOpen}
          </p>
        </div>
      )}

      {/* Cash available */}
      {portfolio && (
        <div className="bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <SectionLabel>Buying Power</SectionLabel>
            <p className="text-lg font-black tabular-nums">{fmt$(portfolio.cash)}</p>
          </div>
          <div className="text-right">
            <SectionLabel>Portfolio Value</SectionLabel>
            <p className="text-sm font-bold tabular-nums text-surface-300">{fmt$(portfolio.totalValue)}</p>
          </div>
        </div>
      )}

      {/* Buy / Sell toggle */}
      <div className="flex rounded-xl overflow-hidden border border-surface-700">
        {['buy','sell'].map(a => (
          <button key={a} onClick={() => { setAction(a); setErr(''); setResult(null); }}
            className={`flex-1 py-2.5 text-sm font-black transition-all ${
              action === a
                ? a === 'buy' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                : 'bg-surface-800 text-surface-500 hover:text-white'
            }`}>
            {a === 'buy' ? '📈 Buy' : '📉 Sell'}
          </button>
        ))}
      </div>

      {/* Symbol input */}
      <div>
        <SectionLabel>Ticker Symbol</SectionLabel>
        <div className="relative">
          <input type="text" value={symbol} onChange={e => onSymbolChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && symbol && fetchPrice(symbol)}
            placeholder="e.g. AAPL, TSLA, NVDA…" maxLength={10}
            className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-sm font-bold placeholder:text-surface-500 placeholder:font-normal focus:outline-none focus:border-brand-500/60 transition-colors" />
          {priceLoading && (
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-xs inline-block">◌</motion.span>
          )}
        </div>
      </div>

      {/* Live price card */}
      <AnimatePresence>
        {liveData && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-surface-800 border border-surface-700 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-base">{liveData.symbol}</p>
                <p className="text-xs text-surface-500 truncate max-w-[180px]">{liveData.name}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-xl tabular-nums">${liveData.price?.toFixed(2)}</p>
                {liveData.changePct != null && (
                  <p className={`text-xs font-bold tabular-nums ${liveData.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {liveData.changePct >= 0 ? '+' : ''}{liveData.changePct}% today
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shares input */}
      <div>
        <SectionLabel>Number of Shares</SectionLabel>
        <input type="number" value={shares} onChange={e => setShares(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitTrade()}
          placeholder="0" min="0.01" step="1"
          className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-sm font-bold placeholder:text-surface-500 placeholder:font-normal focus:outline-none focus:border-brand-500/60 transition-colors" />
      </div>

      {/* Order summary */}
      <AnimatePresence>
        {orderTotal != null && qty > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-surface-400">
              {qty} share{qty !== 1 ? 's' : ''} × ${liveData?.price?.toFixed(2)}
            </p>
            <p className="font-black text-sm tabular-nums">{fmt$(orderTotal)}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {err && (
        <p className="text-xs text-red-400 text-center px-2">{err}</p>
      )}

      {/* Success */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 text-center">
            <p className="text-lg mb-1">✅</p>
            <p className="text-sm font-bold text-emerald-400">{result.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button onClick={submitTrade} disabled={!canTrade}
        className={`w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98] disabled:opacity-40 ${
          action === 'buy' ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20' : 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20'
        }`}>
        {trading ? 'Placing order…' : action === 'buy' ? `Buy ${symbol || 'Stock'}` : `Sell ${symbol || 'Stock'}`}
      </button>

      {/* Market closed modal */}
      <AnimatePresence>
        {showClosedWarning && (
          <MarketClosedModal
            nextOpen={nextOpen}
            onProceed={executeTrade}
            onCancel={() => setShowClosedWarning(false)}
          />
        )}
      </AnimatePresence>

      {/* Quick picks */}
      <div>
        <SectionLabel>Quick buy</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {['AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL','COIN'].map(sym => (
            <button key={sym} onClick={() => { setSymbol(sym); onSymbolChange(sym); }}
              className="px-2.5 py-1 rounded-lg bg-surface-800 border border-surface-700 text-xs font-bold text-surface-400 hover:text-white hover:border-surface-600 transition-colors">
              {sym}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [trades, setTrades]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  useEffect(() => {
    api.getTradingHistory()
      .then(d => setTrades(d.trades || []))
      .catch(e => setErr(e?.data?.error || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader title="Loading trade history…" />;
  if (err)     return <Err message={err} />;

  if (!trades.length) {
    return (
      <div className="text-center py-10">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-sm font-semibold text-white">No trades yet</p>
        <p className="text-xs text-surface-500 mt-1">Your executed trades will appear here</p>
      </div>
    );
  }

  // Group by date
  const grouped = {};
  for (const t of trades) {
    const d = t.created_at.split('T')[0];
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(t);
  }

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([date, dayTrades]) => (
        <div key={date}>
          <SectionLabel>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {dayTrades.map(t => {
              const isBuy = t.action === 'buy';
              return (
                <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-surface-800 border border-surface-700 rounded-xl flex items-center gap-3 px-3.5 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${isBuy ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                    {isBuy ? '↑' : '↓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm">{t.symbol}</p>
                    <p className="text-[10px] text-surface-500">
                      {isBuy ? 'Bought' : 'Sold'} {t.shares} sh · ${parseFloat(t.price).toFixed(2)}/sh
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-black text-sm tabular-nums ${isBuy ? 'text-red-400' : 'text-emerald-400'}`}>
                      {isBuy ? '-' : '+'}{fmt$(t.total)}
                    </p>
                    <p className="text-[9px] text-surface-600">
                      {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Learn / Quiz tab ─────────────────────────────────────────────────────────
function LearnTab() {
  const [stats, setStats]       = useState(null);
  const [quiz, setQuiz]         = useState(null);
  const [quizLoading, setQLoad] = useState(false);
  const [quizErr, setQErr]      = useState('');
  const [selected, setSelected] = useState(null);
  const [result, setResult]     = useState(null);
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    api.getTradingStats().then(setStats).catch(() => {});
  }, [result]);

  async function loadQuiz(type) {
    setQLoad(true); setQErr(''); setQuiz(null); setSelected(null); setResult(null);
    try { setQuiz(await api.getQuiz(type)); }
    catch (e) { setQErr(e?.data?.error || 'Failed to generate quiz'); }
    finally { setQLoad(false); }
  }

  async function submitAnswer(val) {
    if (!quiz || answering || result) return;
    setSelected(val); setAnswering(true);
    try {
      const r = await api.submitQuizAnswer(quiz.token, val);
      setResult(r);
    } catch (e) { setQErr(e?.data?.error || 'Could not check answer'); setSelected(null); }
    finally { setAnswering(false); }
  }

  const quizPositive = quiz?.history
    ? quiz.history.at(-1)?.close >= quiz.history[0]?.close
    : true;

  return (
    <div className="flex flex-col gap-4">

      {/* Stats banner */}
      {stats && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-surface-800 border border-surface-700 rounded-2xl p-4">
          <SectionLabel>Your Learning Stats</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-2xl font-black text-white">{stats.quizTotal}</p>
              <p className="text-[9px] text-surface-500 font-bold uppercase tracking-wider mt-0.5">Answered</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-emerald-400">{stats.quizCorrect}</p>
              <p className="text-[9px] text-surface-500 font-bold uppercase tracking-wider mt-0.5">Correct</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-brand-400">{stats.quizPct}%</p>
              <p className="text-[9px] text-surface-500 font-bold uppercase tracking-wider mt-0.5">Accuracy</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quiz type picker */}
      {!quiz && !quizLoading && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Choose a quiz type</SectionLabel>

          <button onClick={() => loadQuiz('chart')}
            className="bg-surface-800 border border-surface-700 hover:border-brand-500/40 rounded-2xl p-4 text-left transition-all active:scale-[0.98]">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📈</span>
              <div>
                <p className="font-black text-sm text-white">Chart Prediction</p>
                <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
                  Study a real stock chart and predict: will it go <span className="text-emerald-400 font-bold">up</span>, <span className="text-red-400 font-bold">down</span>, or sideways in the next 5 days? We reveal the actual answer.
                </p>
                <Badge variant="brand" className="mt-2">+50 XP if correct</Badge>
              </div>
            </div>
          </button>

          <button onClick={() => loadQuiz('news')}
            className="bg-surface-800 border border-surface-700 hover:border-purple-500/40 rounded-2xl p-4 text-left transition-all active:scale-[0.98]">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🗞️</span>
              <div>
                <p className="font-black text-sm text-white">News Impact</p>
                <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
                  A breaking news scenario drops — predict how the market reacts. Learn how <span className="text-white font-semibold">real events</span> move stock prices.
                </p>
                <Badge variant="purple" className="mt-2">+50 XP if correct</Badge>
              </div>
            </div>
          </button>
        </div>
      )}

      {quizLoading && <Loader title="Generating quiz…" sub="Fetching real market data" />}
      {quizErr && <Err message={quizErr} onRetry={() => setQuiz(null)} />}

      {/* Active quiz */}
      {quiz && !quizLoading && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4">

          {/* Quiz card */}
          <div className="bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className={`px-4 py-3 border-b border-surface-700 ${
              quiz.type === 'chart' ? 'bg-brand-500/8' : 'bg-purple-500/8'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-base">{quiz.type === 'chart' ? '📈' : '🗞️'}</span>
                <Badge variant={quiz.type === 'chart' ? 'brand' : 'purple'}>
                  {quiz.type === 'chart' ? 'Chart Prediction' : 'News Impact'}
                </Badge>
              </div>
            </div>

            <div className="p-4">
              {/* News headline + context */}
              {quiz.type === 'news' && (
                <div className="flex flex-col gap-2.5 mb-4">
                  <div className="bg-surface-900 border border-amber-500/25 rounded-xl p-3">
                    <SectionLabel>🚨 Breaking News</SectionLabel>
                    <p className="text-sm font-bold text-white leading-snug">{quiz.headline}</p>
                    {quiz.sectors && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {quiz.sectors.map(s => (
                          <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600 font-bold">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {quiz.context && (
                    <div className="bg-surface-900 border border-surface-700 rounded-xl p-3">
                      <SectionLabel>📖 Background</SectionLabel>
                      <p className="text-xs text-surface-300 leading-relaxed">{quiz.context}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Chart + stats */}
              {quiz.type === 'chart' && quiz.history && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <SectionLabel>{quiz.name} ({quiz.symbol})</SectionLabel>
                    {result && (
                      <Badge variant={result.pctChange > 0 ? 'green' : result.pctChange < 0 ? 'red' : 'yellow'}>
                        Actually {result.pctChange > 0 ? '+' : ''}{result.pctChange}%
                      </Badge>
                    )}
                  </div>
                  <QuizChart
                    data={quiz.history}
                    future={result?.futureData}
                    revealed={!!result}
                    positive={quizPositive}
                  />
                  {!result && (
                    <p className="text-[10px] text-surface-600 text-center mt-1">
                      {quiz.stats?.daysShown || '~45'} days of history shown · predict next 5 days
                    </p>
                  )}

                  {/* Stats row */}
                  {quiz.stats && (
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                      {[
                        { lbl: 'Period Return', val: `${quiz.stats.periodReturn >= 0 ? '+' : ''}${quiz.stats.periodReturn}%`,
                          color: quiz.stats.periodReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
                        { lbl: 'Period High',   val: `$${quiz.stats.periodHigh}`,   color: 'text-white' },
                        { lbl: 'Volume',        val: quiz.stats.volumeTrend,
                          color: quiz.stats.volumeTrend === 'increasing' ? 'text-emerald-400' : quiz.stats.volumeTrend === 'decreasing' ? 'text-red-400' : 'text-amber-400' },
                      ].map(({ lbl, val, color }) => (
                        <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-lg p-2 text-center">
                          <p className="text-[8px] text-surface-500 font-bold uppercase tracking-wider mb-0.5">{lbl}</p>
                          <p className={`text-xs font-black ${color}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hints */}
                  {!result && quiz.hints && (
                    <div className="mt-2.5 bg-surface-900 border border-brand-500/20 rounded-xl p-3">
                      <SectionLabel>💡 What to look for</SectionLabel>
                      <ul className="flex flex-col gap-1">
                        {quiz.hints.map((h, i) => (
                          <li key={i} className="text-[10px] text-surface-400 leading-snug flex items-start gap-1.5">
                            <span className="text-brand-500 mt-0.5 flex-shrink-0">·</span>{h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Question */}
              <p className="text-sm font-bold text-white leading-snug mb-4">{quiz.question}</p>

              {/* Options */}
              <div className="flex flex-col gap-2">
                {quiz.options.map(opt => {
                  const isSelected = selected === opt.value;
                  const isCorrect  = result?.correctAnswer === opt.value;
                  const isWrong    = result && isSelected && !result.correct;
                  let cls = 'bg-surface-900 border-surface-700 text-surface-300';
                  if (result) {
                    if (isCorrect) cls = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
                    else if (isWrong) cls = 'bg-red-500/15 border-red-500/40 text-red-300';
                    else cls = 'bg-surface-900 border-surface-800 opacity-50 text-surface-500';
                  } else if (isSelected) {
                    cls = 'bg-brand-500/15 border-brand-500/40 text-brand-300';
                  }
                  return (
                    <button key={opt.value}
                      onClick={() => !result && submitAnswer(opt.value)}
                      disabled={!!result || answering}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left active:scale-[0.98] disabled:cursor-default ${cls}`}>
                      <span className="text-lg">{isSelected || (result && isCorrect) ? (isCorrect ? '✅' : '❌') : '○'}</span>
                      <div>
                        <p className="font-black text-sm">{opt.label}</p>
                        <p className="text-[10px] opacity-70">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Result explanation */}
          <AnimatePresence>
            {result && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-2">
                {/* Score */}
                <div className={`rounded-2xl border p-4 ${result.correct ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-surface-800 border-amber-500/25'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{result.correct ? '🎯' : '📚'}</span>
                    <div>
                      <p className={`font-black text-base ${result.correct ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {result.correct ? 'Nailed it! +50 XP' : 'Not quite — +10 XP for trying'}
                      </p>
                      <p className="text-[10px] text-surface-500">
                        Correct answer: <span className="font-bold text-white capitalize">{result.correctAnswer}</span>
                        {result.pctChange != null && ` · ${result.pctChange > 0 ? '+' : ''}${result.pctChange}% actual move`}
                      </p>
                    </div>
                  </div>
                  {result.explanation && (
                    <p className="text-xs text-surface-300 leading-relaxed">{result.explanation}</p>
                  )}
                </div>
                {/* Key lesson */}
                {result.keyLesson && (
                  <div className="bg-brand-500/8 border border-brand-500/25 rounded-2xl p-3.5">
                    <SectionLabel>🧠 Key Lesson</SectionLabel>
                    <p className="text-xs text-surface-200 leading-relaxed">{result.keyLesson}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Next question */}
          {result && (
            <div className="flex gap-2">
              <button onClick={() => loadQuiz(quiz.type)}
                className="flex-1 py-3 rounded-2xl bg-brand-500 text-white text-sm font-black active:scale-[0.98] transition-all">
                Next {quiz.type === 'chart' ? 'Chart' : 'Scenario'} →
              </button>
              <button onClick={() => { setQuiz(null); setResult(null); setSelected(null); }}
                className="px-4 py-3 rounded-2xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-400 hover:text-white">
                Menu
              </button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ─── Premium gate ─────────────────────────────────────────────────────────────
function PremiumGate() {
  return (
    <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-4xl shadow-2xl shadow-amber-500/30">
        💎
      </div>
      <div>
        <h2 className="text-2xl font-black text-white mb-2">Premium Feature</h2>
        <p className="text-sm text-surface-400 leading-relaxed max-w-xs">
          Paper Trading is available to <span className="text-amber-400 font-bold">Premium</span> subscribers.
          Practice trading with $100,000 virtual cash at real market prices — zero risk.
        </p>
      </div>
      <div className="w-full bg-surface-800 border border-surface-700 rounded-2xl p-4 text-left flex flex-col gap-2.5">
        {[
          ['💹', 'Real-time paper portfolio with live P&L'],
          ['📊', 'Buy & sell at actual market prices'],
          ['📋', 'Full trade history and performance tracking'],
          ['🧠', 'Chart prediction & news quiz to sharpen your skills'],
        ].map(([icon, text]) => (
          <div key={text} className="flex items-center gap-2.5">
            <span className="text-base">{icon}</span>
            <p className="text-xs text-surface-300">{text}</p>
          </div>
        ))}
      </div>
      <div className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-black shadow-lg shadow-amber-500/25">
        Upgrade to Premium — Coming Soon
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'portfolio', label: 'Portfolio', icon: '💼', sub: 'Holdings'   },
  { id: 'trade',     label: 'Trade',     icon: '💹', sub: 'Buy & Sell' },
  { id: 'history',   label: 'History',   icon: '📋', sub: 'Past trades'},
  { id: 'learn',     label: 'Learn',     icon: '🧠', sub: 'Quiz'       },
];

export default function Trading() {
  const [tab, setTab]         = useState('portfolio');
  const [premium, setPremium] = useState(null); // null=checking, true=ok, false=no
  const [checking, setChecking] = useState(true);

  // Check premium by trying to hit the portfolio endpoint
  useEffect(() => {
    api.getTradingPortfolio()
      .then(() => setPremium(true))
      .catch(e => {
        if (e?.status === 403) setPremium(false);
        else setPremium(true); // any other error means they're premium, show the real error in the tab
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="screen-card pb-28">
        <Loader title="Loading Paper Trading…" />
      </div>
    );
  }

  if (!premium) {
    return (
      <div className="screen-card pb-28">
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-1">Paper Trading</p>
          <h1 className="text-[26px] font-black tracking-tight leading-none">Simulator</h1>
        </motion.div>
        <PremiumGate />
      </div>
    );
  }

  return (
    <div className="screen-card pb-28">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-1">Paper Trading</p>
            <h1 className="text-[26px] font-black tracking-tight leading-none">Simulator</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400">Live Prices</span>
          </div>
        </div>
      </motion.div>

      {/* Tab bar */}
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border transition-all active:scale-95 ${
                active
                  ? 'bg-brand-500/12 border-brand-500/40 text-brand-400'
                  : 'bg-surface-800 border-surface-700 text-surface-500 hover:border-surface-600'
              }`}>
              <span className="text-lg leading-none">{t.icon}</span>
              <span className={`text-[10px] font-black leading-none ${active ? 'text-brand-400' : 'text-surface-400'}`}>{t.label}</span>
              <span className={`text-[9px] leading-none ${active ? 'text-brand-400/70' : 'text-surface-600'}`}>{t.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === 'portfolio' && (
          <motion.div key="portfolio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PortfolioTab onRefresh={() => {}} />
          </motion.div>
        )}
        {tab === 'trade' && (
          <motion.div key="trade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TradeTab />
          </motion.div>
        )}
        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HistoryTab />
          </motion.div>
        )}
        {tab === 'learn' && (
          <motion.div key="learn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LearnTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
