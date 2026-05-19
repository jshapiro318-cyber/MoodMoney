import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatNum(n, prefix = '') {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${prefix}${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${prefix}${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${prefix}${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${prefix}${(n / 1e3).toFixed(1)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

function riskColor(level) {
  return { low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400', 'very high': 'text-red-500' }[level] || 'text-surface-400';
}
function riskBg(level) {
  return { low: 'bg-emerald-500/10 border-emerald-500/20', medium: 'bg-amber-500/10 border-amber-500/20', high: 'bg-red-500/10 border-red-500/20', 'very high': 'bg-red-600/15 border-red-600/25' }[level] || 'bg-surface-700 border-surface-600';
}

// ─── Micro-components ─────────────────────────────────────────────────────────
function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const W = 52, H = 22;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      <polyline fill="none" stroke={positive ? '#22c55e' : '#ef4444'} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function Pct({ value, size = 'sm' }) {
  const pos = value >= 0;
  const cls = size === 'lg' ? 'text-base font-black' : 'text-xs font-bold';
  return (
    <span className={`tabular-nums ${cls} ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{value?.toFixed(2)}%
    </span>
  );
}

function Badge({ children, variant = 'zinc' }) {
  const variants = {
    bullish: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    bearish: 'bg-red-500/12 text-red-400 border-red-500/25',
    neutral: 'bg-amber-500/12 text-amber-400 border-amber-500/25',
    brand:   'bg-brand-500/12 text-brand-400 border-brand-500/25',
    purple:  'bg-purple-500/12 text-purple-400 border-purple-500/25',
    zinc:    'bg-surface-700 text-surface-300 border-surface-600',
    green:   'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    red:     'bg-red-500/12 text-red-400 border-red-500/25',
    high:    'bg-red-500/12 text-red-400 border-red-500/25',
    medium:  'bg-amber-500/12 text-amber-400 border-amber-500/25',
    low:     'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${variants[variant] || variants.zinc}`}>
      {children}
    </span>
  );
}

function Tooltip({ term, children }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-0.5">
      <span className="border-b border-dashed border-surface-500">{term}</span>
      <button onClick={() => setShow(s => !s)}
        className="w-3.5 h-3.5 rounded-full bg-surface-600 text-[8px] font-black text-surface-300 flex items-center justify-center flex-shrink-0 hover:bg-brand-500 transition-colors">
        ?
      </button>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute bottom-full left-0 mb-2 w-52 bg-surface-700 border border-surface-600 rounded-xl p-3 z-50 shadow-xl">
            <p className="text-xs text-surface-300 leading-relaxed">{children}</p>
            <button onClick={() => setShow(false)} className="absolute top-2 right-2 text-surface-500 text-xs">✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function SectionLabel({ children }) {
  return <p className="text-[9.5px] font-bold tracking-[0.1em] uppercase text-surface-300 mb-1.5">{children}</p>;
}

function Loader({ title, sub }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-surface-700" />
        <motion.div className="absolute inset-0 rounded-full border-2 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent"
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {sub && <p className="text-xs text-surface-500 mt-0.5 max-w-[260px] leading-relaxed">{sub}</p>}
      </div>
    </div>
  );
}

function Err({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
        <Icon name="exclamation-circle" size={18} className="text-red-400" />
      </div>
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

function ScoreRing({ score, size = 48 }) {
  const r = 16, circ = 2 * Math.PI * r;
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#26262c" strokeWidth="3" />
        <motion.circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${(score / 100) * circ} ${circ}` }}
          transition={{ duration: 1, ease: 'easeOut' }} />
      </svg>
      <span className="absolute text-[10px] font-black tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

function MarketStatus() {
  const now = new Date();
  const month = now.getMonth(); // local month (0=Jan)
  const etOffset = (month >= 2 && month <= 10) ? -4 : -5; // EDT vs EST
  const et = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
  const day = et.getDay(), h = et.getHours(), m = et.getMinutes();
  const t = h * 100 + m;
  const isOpen = day > 0 && day < 6 && t >= 930 && t < 1600;

  const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let nextOpen = '';
  if (!isOpen) {
    if      (day === 5 && t >= 1600) nextOpen = 'Mon 9:30 AM';
    else if (day === 6)              nextOpen = 'Mon 9:30 AM';
    else if (day === 0)              nextOpen = 'Mon 9:30 AM';
    else if (t < 930)                nextOpen = 'Today 9:30 AM';
    else                             nextOpen = `${DAY[day + 1]} 9:30 AM`; // Mon–Thu after close
  }

  return isOpen
    ? (
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-bold text-emerald-400">Market Open</span>
      </div>
    ) : (
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-surface-500" />
        <div className="flex flex-col items-end">
          <span className="text-xs font-bold text-surface-500">Market Closed</span>
          {nextOpen && <span className="text-[9px] text-surface-600 leading-tight">Opens {nextOpen}</span>}
        </div>
      </div>
    );
}

// ─── Interactive price chart ──────────────────────────────────────────────────
function PriceChart({ data, positive }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  if (!data || data.length < 2) return <div className="h-28 flex items-center justify-center text-xs text-surface-500">No chart data</div>;

  const W = 320, H = 100, PT = 6, PR = 4, PB = 18, PL = 0;
  const closes = data.map(d => d.close);
  const minV = Math.min(...closes), maxV = Math.max(...closes), rangeV = maxV - minV || 1;
  const xp = i => PL + (i / (data.length - 1)) * (W - PL - PR);
  const yp = v => PT + (1 - (v - minV) / rangeV) * (H - PT - PB);
  const linePoints = data.map((d, i) => `${xp(i)},${yp(d.close)}`).join(' ');
  const areaD = `M${xp(0)},${yp(data[0].close)} ${data.slice(1).map((d, i) => `L${xp(i+1)},${yp(d.close)}`).join(' ')} L${xp(data.length-1)},${H-PB} L${xp(0)},${H-PB} Z`;
  const color = positive ? '#22c55e' : '#ef4444';

  function onMove(e) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const raw = ((cx - rect.left) / rect.width * W - PL) / (W - PL - PR) * (data.length - 1);
    const i = Math.max(0, Math.min(data.length - 1, Math.round(raw)));
    setHover({ i, cx: xp(i), cy: yp(data[i].close), d: data[i] });
  }

  return (
    <div className="relative w-full select-none">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ touchAction: 'none' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
        <defs>
          <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#cg2)" />
        <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={linePoints} />
        {hover && (
          <>
            <line x1={hover.cx} y1={PT} x2={hover.cx} y2={H-PB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,2" />
            <circle cx={hover.cx} cy={hover.cy} r="3.5" fill={color} stroke="#15151a" strokeWidth="2" />
          </>
        )}
        <text x={PL} y={H} fontSize="7.5" fill="#52525b">{data[0]?.date}</text>
        <text x={W-PR} y={H} fontSize="7.5" fill="#52525b" textAnchor="end">{data.at(-1)?.date}</text>
      </svg>
      {hover && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-surface-800 border border-surface-600 rounded-lg px-2.5 py-1.5 text-center pointer-events-none shadow-lg">
          <p className="text-xs font-black tabular-nums" style={{ color }}>${hover.d.close?.toFixed(2)}</p>
          <p className="text-[9px] text-surface-500">{hover.d.date}</p>
        </div>
      )}
    </div>
  );
}

// ─── Stock Detail Bottom Sheet ────────────────────────────────────────────────
const RANGES = ['1W', '1M', '3M', '6M', '1Y'];

function StockDetailSheet({ symbol, onClose, onAnalyze }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [range,   setRange]   = useState('1M');
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true); setErr('');
    api.getStockDetail(symbol, range)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(e => { if (!cancelled) setErr(e?.data?.error || 'Failed to load details'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, range]);

  const pos = detail ? detail.changePct >= 0 : true;
  const f = detail?.fundamentals || {};
  const pctIn52 = f.low52 != null && f.high52 != null && detail?.price != null
    ? Math.max(0, Math.min(100, ((detail.price - f.low52) / (f.high52 - f.low52)) * 100)) : null;

  const METRICS = [
    { label: 'Market Cap',    val: formatNum(f.marketCap, '$') },
    { label: 'Volume',        val: formatNum(f.volume) },
    { label: 'Avg Volume',    val: formatNum(f.avgVolume) },
    { label: 'Day High',      val: f.dayHigh  != null ? `$${f.dayHigh}`  : '—' },
    { label: 'Day Low',       val: f.dayLow   != null ? `$${f.dayLow}`   : '—' },
    { label: 'Open',          val: f.openPrice!= null ? `$${f.openPrice}`: '—' },
    { label: 'P/E Ratio',     val: f.pe       != null ? f.pe             : '—', tooltip: 'Price-to-Earnings ratio. How much investors pay per $1 of profit. Lower can mean undervalued.' },
    { label: 'Forward P/E',   val: f.forwardPe!= null ? f.forwardPe      : '—', tooltip: 'Expected P/E based on next year\'s earnings estimate. Shows if growth is priced in.' },
    { label: 'EPS',           val: f.eps      != null ? `$${f.eps}`      : '—', tooltip: 'Earnings Per Share — how much profit the company made per share of stock.' },
    { label: 'Beta',          val: f.beta     != null ? f.beta           : '—', tooltip: 'Measures volatility vs the market. Beta > 1 = moves more than the market. Beta < 1 = more stable.' },
    { label: 'Div Yield',     val: f.dividendYield != null ? `${f.dividendYield}%` : '—', tooltip: 'Annual dividend as a % of share price. Income investors look for higher yields.' },
    { label: 'Price/Book',    val: f.priceToBook!= null ? f.priceToBook  : '—', tooltip: 'Share price vs book value per share. Below 1 can signal undervaluation.' },
    { label: 'Short Float',   val: f.shortFloat != null ? `${f.shortFloat}%` : '—', tooltip: 'Percentage of float shares being shorted. High short % + rising price = potential short squeeze.' },
    { label: 'Analyst Target',val: f.analystTarget != null ? `$${f.analystTarget}` : '—' },
  ].filter(m => m.val !== '—');

  return (
    <>
      <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      <motion.div key="sh" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f14] border-t border-surface-700 rounded-t-[24px] max-h-[92vh] overflow-y-auto">

        {/* Drag handle */}
        <div className="sticky top-0 bg-[#0f0f14] z-10 flex flex-col items-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-surface-700 mb-3" />
          {/* Header */}
          <div className="w-full px-5 flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {detail ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-black tracking-tight">{detail.symbol}</h2>
                    <Pct value={detail.changePct} size="lg" />
                  </div>
                  <p className="text-xs text-surface-400 truncate mt-0.5">{detail.name}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {detail.sector && <Badge variant="zinc">{detail.sector}</Badge>}
                    {detail.industry && <Badge variant="zinc">{detail.industry}</Badge>}
                    {f.riskLevel && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${riskBg(f.riskLevel)}`}>
                        <span className={riskColor(f.riskLevel)}>⚡ {f.riskLevel} risk</span>
                      </span>
                    )}
                    {f.analystRating && (
                      <Badge variant={f.analystRating.includes('buy') ? 'green' : f.analystRating.includes('sell') ? 'red' : 'zinc'}>
                        {f.analystRating.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                </>
              ) : (
                <h2 className="text-2xl font-black tracking-tight">{symbol}</h2>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
              {detail && <span className="text-xl font-black tabular-nums">${detail.price?.toFixed(2)}</span>}
              <button onClick={onClose}
                className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-white text-xs font-bold transition-colors">✕</button>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8">
          {/* Price change row */}
          {detail && (
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-sm font-bold tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                {pos ? '+' : ''}${Math.abs(detail.change)?.toFixed(2)} today
              </span>
              {f.high52 && f.low52 && (
                <span className="text-xs text-surface-500">
                  52wk: ${f.low52?.toFixed(0)} — ${f.high52?.toFixed(0)}
                </span>
              )}
            </div>
          )}

          {/* Range tabs */}
          <div className="flex gap-1.5 mb-4">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 ${range === r ? 'bg-brand-500 text-white' : 'bg-surface-800 border border-surface-700 text-surface-500 hover:text-white'}`}>
                {r}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="mb-4">
            {loading ? (
              <div className="h-28 flex items-center justify-center">
                <motion.div className="w-6 h-6 rounded-full border-2 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent"
                  animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
              </div>
            ) : err ? (
              <div className="h-20 flex items-center justify-center text-xs text-surface-500">{err}</div>
            ) : detail?.chart ? (
              <PriceChart data={detail.chart} positive={pos} />
            ) : null}
          </div>

          {/* 52-week range bar */}
          {detail && !loading && f.high52 != null && f.low52 != null && (
            <div className="bg-surface-800 border border-surface-700 rounded-xl p-3 mb-3">
              <SectionLabel>52-Week Range</SectionLabel>
              <div className="flex items-center justify-between text-[10px] text-surface-400 mb-2">
                <span className="font-bold">${f.low52?.toFixed(2)}</span>
                {pctIn52 != null && <span className="text-surface-600">{pctIn52.toFixed(0)}% of range</span>}
                <span className="font-bold">${f.high52?.toFixed(2)}</span>
              </div>
              <div className="relative h-1.5 bg-surface-700 rounded-full">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 opacity-40" />
                {pctIn52 != null && (
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-[#0f0f14] shadow-md z-10"
                    style={{ left: `calc(${pctIn52}% - 6px)` }} />
                )}
              </div>
            </div>
          )}

          {/* Company description */}
          {detail?.description && (
            <div className="bg-surface-800 border border-surface-700 rounded-xl p-3.5 mb-3">
              <SectionLabel>About {detail.symbol}</SectionLabel>
              <p className={`text-xs text-surface-300 leading-relaxed ${!descExpanded ? 'line-clamp-3' : ''}`}>
                {detail.description}
              </p>
              {detail.description.length > 180 && (
                <button onClick={() => setDescExpanded(e => !e)}
                  className="text-[10px] font-bold text-brand-400 mt-1 hover:text-brand-300 transition-colors">
                  {descExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
              {detail.employees && (
                <p className="text-[10px] text-surface-500 mt-2">👥 {detail.employees.toLocaleString()} employees</p>
              )}
            </div>
          )}

          {/* Key metrics grid */}
          {detail && !loading && METRICS.length > 0 && (
            <div className="mb-4">
              <SectionLabel>Key Stats</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {METRICS.map(({ label, val, tooltip }) => (
                  <div key={label} className="bg-surface-800 border border-surface-700 rounded-xl p-3">
                    <p className="text-[9px] font-bold tracking-wider uppercase text-surface-500 mb-0.5">
                      {tooltip ? <Tooltip term={label}>{tooltip}</Tooltip> : label}
                    </p>
                    <p className="text-sm font-black text-white tabular-nums">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent news */}
          {detail?.recentNews?.length > 0 && (
            <div className="mb-4">
              <SectionLabel>Recent News · {detail.symbol}</SectionLabel>
              <div className="flex flex-col gap-2">
                {detail.recentNews.map((n, i) => (
                  <div key={i} className="bg-surface-800 border border-surface-700 rounded-xl p-3">
                    <p className="text-xs font-semibold text-white leading-snug mb-1">{n.headline}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-brand-400 font-medium">{n.source}</span>
                      {n.age && <span className="text-[10px] text-surface-500">{n.age}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex flex-col gap-2">
            <button onClick={() => { onClose(); onAnalyze(symbol); }}
              className="w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-black active:scale-[0.98] transition-all shadow-lg shadow-brand-500/20">
              🔬 Deep Dive AI Analysis
            </button>
            <p className="text-[10px] text-surface-600 text-center">
              ⚠️ Data from Yahoo Finance. Not financial advice.
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ─── Daily pick card ──────────────────────────────────────────────────────────
function DailyPickCard({ pick, index }) {
  const [open, setOpen] = useState(false);
  const sc = pick.sentiment === 'bullish' ? 'bullish' : pick.sentiment === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];
  const mainReason = pick.mainReason || pick.whyToday;
  const shortTarget = pick.shortTermTarget || pick.shortOutlook;
  const mediumTarget = pick.mediumTermTarget || pick.weekOutlook;
  const confidence = pick.confidenceScore != null ? pick.confidenceScore * 10 : (pick.technicalScore ?? 50);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />
      <div className="ml-1 px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{pick.emoji}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-base tracking-tight">{pick.symbol}</span>
                <Badge variant={sc}>bullish</Badge>
                <Badge variant={pick.riskLevel}>{pick.riskLevel} risk</Badge>
              </div>
              <p className="text-[11px] text-surface-500 mt-0.5">{pick.name}</p>
              {pick.marketCap && <p className="text-[10px] text-surface-600 mt-0.5">{pick.marketCap}</p>}
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <ScoreRing score={confidence} />
            <span className="text-[9px] text-surface-500">confidence</span>
          </div>
        </div>

        <div className="bg-surface-900 border border-surface-700 rounded-xl p-3 mb-3">
          <SectionLabel>📈 Why It&apos;s Going Up</SectionLabel>
          <p className="text-xs text-surface-300 leading-relaxed">{mainReason}</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[{ lbl: '🕯 Pattern', val: pick.candlestickPattern }, { lbl: 'RSI', val: pick.rsiReading }, { lbl: 'Volume', val: pick.volumeRead }]
            .filter(x => x.val).map(({ lbl, val }) => (
              <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-lg p-2">
                <SectionLabel>{lbl}</SectionLabel>
                <p className="text-[10px] text-surface-200 leading-tight line-clamp-2">{val}</p>
              </div>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {pick.entryRange && <div className="bg-surface-900 border border-emerald-500/20 rounded-lg p-2"><SectionLabel>🎯 Entry</SectionLabel><p className="text-xs font-bold text-emerald-400">{pick.entryRange}</p></div>}
          {pick.stopLoss   && <div className="bg-surface-900 border border-red-500/20 rounded-lg p-2"><SectionLabel>🛑 Stop-Loss</SectionLabel><p className="text-xs font-bold text-red-400">{pick.stopLoss}</p></div>}
          {shortTarget     && <div className="bg-surface-900 border border-surface-700 rounded-lg p-2"><SectionLabel>⚡ 1–5 Day</SectionLabel><p className="text-xs font-bold text-white">{shortTarget}</p></div>}
          {mediumTarget    && <div className="bg-surface-900 border border-surface-700 rounded-lg p-2"><SectionLabel>📅 2–6 Week</SectionLabel><p className="text-xs font-bold text-white">{mediumTarget}</p></div>}
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2"><SectionLabel>Support</SectionLabel><p className="text-sm font-bold text-emerald-400">{pick.support}</p></div>
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2"><SectionLabel>Resistance</SectionLabel><p className="text-sm font-bold text-red-400">{pick.resistance}</p></div>
        </div>

        <button onClick={() => setOpen(o => !o)} className="text-[11px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
          {open ? '↑ Collapse report' : '↓ Full research report'}
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-surface-700">
                {[
                  { lbl: '📊 Technical Setup', val: pick.technicalSetup },
                  { lbl: '🕯 Candlestick', val: pick.candlestickMeaning },
                  { lbl: '📉 Moving Averages', val: pick.maSetup },
                  { lbl: '🏢 Fundamentals', val: pick.fundamentalStrengths },
                  { lbl: '🏦 Analyst View', val: pick.analystSentiment },
                  { lbl: '🚀 Catalysts', val: pick.upcomingCatalysts },
                  { lbl: '⚠️ Key Risk', val: pick.keyRisk },
                ].filter(x => x.val).map(({ lbl, val }) => (
                  <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-xl p-3">
                    <SectionLabel>{lbl}</SectionLabel>
                    <p className="text-xs text-surface-300 leading-relaxed">{val}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Stock analysis result card ───────────────────────────────────────────────
function StockAnalysisResult({ data, onClear }) {
  const [open, setOpen] = useState(false);
  const sc = data.sentiment === 'bullish' ? 'bullish' : data.sentiment === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];
  const verdictColor = { 'Strong Buy': 'text-emerald-400', 'Buy': 'text-emerald-400', 'Hold': 'text-amber-400', 'Sell': 'text-red-400', 'Strong Sell': 'text-red-400' }[data.verdict] || 'text-white';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />
      <div className="ml-1 px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{data.emoji}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-lg tracking-tight">{data.symbol}</span>
                <Badge variant={sc}>{data.sentiment}</Badge>
                <Badge variant={data.riskLevel}>{data.riskLevel} risk</Badge>
              </div>
              <p className="text-[11px] text-surface-500">{data.name}</p>
            </div>
          </div>
          <ScoreRing score={data.technicalScore ?? 50} size={52} />
        </div>
        <div className="bg-surface-900 border border-surface-700 rounded-xl p-3 mb-3 flex items-center justify-between">
          <div><SectionLabel>AI Verdict</SectionLabel><p className={`text-lg font-black ${verdictColor}`}>{data.verdict}</p></div>
          <div className="text-right"><SectionLabel>Conviction</SectionLabel><Badge variant={data.conviction === 'high' ? 'green' : data.conviction === 'low' ? 'red' : 'neutral'}>{data.conviction}</Badge></div>
        </div>
        <p className="text-sm text-surface-300 leading-relaxed mb-3">{data.snapshot}</p>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {[{ lbl: '🕯 Pattern', val: data.candlestickPattern }, { lbl: 'RSI', val: data.rsiAnalysis }, { lbl: 'Moving Avgs', val: data.maAnalysis }, { lbl: 'Volume', val: data.volumeAnalysis }]
            .filter(x => x.val).map(({ lbl, val }) => (
              <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-lg p-2">
                <SectionLabel>{lbl}</SectionLabel>
                <p className="text-[10px] text-surface-200 leading-tight line-clamp-3">{val}</p>
              </div>
            ))}
        </div>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2"><SectionLabel>Support</SectionLabel><p className="text-sm font-bold text-emerald-400">{data.support}</p></div>
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2"><SectionLabel>Resistance</SectionLabel><p className="text-sm font-bold text-red-400">{data.resistance}</p></div>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-[11px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
          {open ? '↑ Less' : '↓ Full outlook & risks'}
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-surface-700">
                {[
                  { lbl: '1–3 Day Outlook', val: data.outlook1to3days },
                  { lbl: 'This Week', val: data.outlookThisWeek },
                  { lbl: 'Next Month', val: data.outlookNextMonth },
                  { lbl: '⚠️ Top Risk', val: data.topRisk },
                  { lbl: '👀 Watch For', val: data.watchFor },
                ].filter(x => x.val).map(({ lbl, val }) => (
                  <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-xl p-3">
                    <SectionLabel>{lbl}</SectionLabel>
                    <p className="text-xs text-surface-300 leading-relaxed">{val}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={onClear} className="mt-4 w-full py-2 rounded-xl bg-surface-900 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white transition-colors">
          Analyze another stock
        </button>
      </div>
    </motion.div>
  );
}

// ─── News event card ──────────────────────────────────────────────────────────
function EventCard({ event, index }) {
  const [open, setOpen] = useState(false);
  const sc = event.impact === 'bullish' ? 'bullish' : event.impact === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];
  const impactLvl = event.impactLevel;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />
      <div className="ml-1 px-4 pt-3.5 pb-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{event.emoji}</span>
            <Badge variant="zinc">{event.category}</Badge>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Badge variant={impactLvl === 'high' ? 'red' : impactLvl === 'low' ? 'low' : 'medium'}>{impactLvl}</Badge>
            <Badge variant={sc}>{event.impact}</Badge>
          </div>
        </div>
        <p className="text-sm font-bold text-white leading-snug mb-1">{event.headline}</p>
        <p className="text-xs text-surface-400 leading-relaxed mb-3 line-clamp-2">{event.summary}</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {event.sectors?.map(s => <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600 font-medium">{s}</span>)}
          {event.watchTickers?.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-bold">{t}</span>)}
        </div>
        {event.summary?.length > 80 && (
          <button onClick={() => setOpen(o => !o)} className="text-[10px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
            {open ? '↑ Less' : '↓ Full summary'}
          </button>
        )}
        {open && <p className="text-xs text-surface-400 leading-relaxed mt-2 pt-2 border-t border-surface-700">{event.summary}</p>}
      </div>
    </motion.div>
  );
}

// ─── Learn tab content ────────────────────────────────────────────────────────
const LEARN_SECTIONS = [
  {
    id: 'what-is-stock', emoji: '📈', title: 'What Is a Stock?',
    content: `When you buy a stock, you're buying a small piece of ownership in a company. If the company grows and becomes more valuable, your shares are worth more. If it struggles, they're worth less.\n\nCompanies sell stock to raise money to grow their business. Investors buy stock hoping the company's value increases over time — that's called capital appreciation.`,
    terms: [
      { term: 'Share', def: 'One unit of ownership in a company.' },
      { term: 'Dividend', def: 'A portion of company profits paid directly to shareholders, usually quarterly.' },
      { term: 'Ticker', def: 'The short symbol used to identify a stock (e.g., AAPL for Apple, TSLA for Tesla).' },
    ],
  },
  {
    id: 'market-cap', emoji: '🏗️', title: 'Market Cap — Company Size',
    content: `Market cap = share price × total shares. It tells you how much the entire company is worth in the eyes of investors.\n\nLarger companies tend to be more stable. Smaller companies can grow faster but carry more risk.`,
    terms: [
      { term: 'Mega Cap', def: '$200B+ (Apple, Microsoft, Amazon). Very stable, slow but steady growth.' },
      { term: 'Large Cap', def: '$10B–$200B. Well-established companies with proven track records.' },
      { term: 'Mid Cap', def: '$2B–$10B. Growth companies still scaling — higher risk and reward.' },
      { term: 'Small Cap', def: 'Under $2B. High growth potential, but much more volatile.' },
    ],
  },
  {
    id: 'risk', emoji: '⚡', title: 'Risk Levels Explained',
    content: `Every investment carries risk. The goal isn't to avoid risk entirely — it's to understand the risk you're taking and make sure the potential reward justifies it.\n\nRisk in stocks comes from many places: the company's finances, the industry it's in, the overall economy, and even investor emotions.`,
    terms: [
      { term: 'Beta', def: 'A number showing how much a stock moves relative to the market. Beta 1.5 = moves 50% more than the market. Beta 0.5 = half as much movement.' },
      { term: 'Volatility', def: 'How much a stock price swings up and down. High volatility = bigger potential gains AND bigger potential losses.' },
      { term: 'Diversification', def: 'Spreading money across many different stocks and sectors so one bad stock doesn\'t wipe you out.' },
    ],
  },
  {
    id: 'valuation', emoji: '🔢', title: 'How Stocks Are Valued',
    content: `Investors use ratios to figure out whether a stock is cheap or expensive relative to how much money the company makes. These numbers help you compare companies in the same industry.`,
    terms: [
      { term: 'P/E Ratio', def: 'Price divided by Earnings per share. A P/E of 20 means you\'re paying $20 for every $1 of annual profit. Higher P/E = investors expect more growth.' },
      { term: 'EPS', def: 'Earnings Per Share — the company\'s profit divided by the number of shares. Growing EPS = growing profits.' },
      { term: 'Forward P/E', def: 'P/E using expected future earnings. Lower forward P/E than trailing P/E = analysts expect profit to grow.' },
      { term: 'Price/Book', def: 'Share price vs the company\'s net assets. Under 1 can signal undervaluation.' },
    ],
  },
  {
    id: 'charts', emoji: '📊', title: 'Reading Stock Charts',
    content: `A stock chart shows you price history over time. Learning to read one helps you spot trends, support levels, and potential entry points.\n\nDon't try to "time" the market perfectly — even professionals can't do that consistently. Focus on the bigger trend.`,
    terms: [
      { term: 'Support Level', def: 'A price where a stock has repeatedly bounced up from. Buyers step in here. Good potential entry zone.' },
      { term: 'Resistance Level', def: 'A price where the stock has repeatedly struggled to go above. Sellers tend to take profits here.' },
      { term: 'Moving Average', def: 'The average price over a set number of days (e.g., 50-day MA). Smooths out noise and shows the trend direction.' },
      { term: 'RSI', def: 'Relative Strength Index (0–100). Above 70 = potentially overbought. Below 30 = potentially oversold. 50 = neutral momentum.' },
      { term: 'Volume', def: 'How many shares were traded. High volume on a price move = stronger conviction. Low volume moves can be misleading.' },
    ],
  },
  {
    id: 'dividends', emoji: '💰', title: 'Dividends & Passive Income',
    content: `Some companies share a portion of their profits directly with shareholders via dividends. This creates passive income — you get paid just for holding the stock.\n\nDividend stocks are popular with more conservative investors who want steady income, not just price growth.`,
    terms: [
      { term: 'Dividend Yield', def: 'Annual dividend payout as a % of share price. A 3% yield on a $100 stock pays $3/year per share.' },
      { term: 'Ex-Dividend Date', def: 'You must own the stock before this date to receive the upcoming dividend payment.' },
      { term: 'DRIP', def: 'Dividend Reinvestment Plan — automatically reinvests dividends to buy more shares, compounding your returns.' },
    ],
  },
];

function LearnTab() {
  const [activeId, setActiveId] = useState(null);
  const active = LEARN_SECTIONS.find(s => s.id === activeId);
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs text-surface-500 leading-relaxed">
          New to investing? Learn the basics before you buy. Tap any topic to dive in.
        </p>
      </div>
      {!activeId ? (
        <div className="flex flex-col gap-2">
          {LEARN_SECTIONS.map((s, i) => (
            <motion.button key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => setActiveId(s.id)}
              className="flex items-center gap-3 bg-surface-800 border border-surface-700 rounded-xl px-4 py-3.5 hover:border-surface-600 transition-all active:scale-[0.99] text-left w-full">
              <span className="text-2xl flex-shrink-0">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{s.title}</p>
                <p className="text-[10px] text-surface-500 mt-0.5">{s.terms.length} key terms</p>
              </div>
              <span className="text-surface-500 text-xs flex-shrink-0">→</span>
            </motion.button>
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <button onClick={() => setActiveId(null)} className="flex items-center gap-2 text-xs font-bold text-brand-400 mb-4 hover:text-brand-300 transition-colors">
            ← Back
          </button>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{active.emoji}</span>
            <h2 className="text-lg font-black">{active.title}</h2>
          </div>
          <div className="bg-surface-800 border border-surface-700 rounded-xl p-4 mb-4">
            {active.content.split('\n\n').map((para, i) => (
              <p key={i} className={`text-sm text-surface-300 leading-relaxed ${i > 0 ? 'mt-3' : ''}`}>{para}</p>
            ))}
          </div>
          <SectionLabel>Key Terms</SectionLabel>
          <div className="flex flex-col gap-2">
            {active.terms.map((t, i) => (
              <motion.div key={t.term} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className="bg-surface-800 border border-surface-700 rounded-xl p-3.5">
                <p className="text-sm font-black text-white mb-1">{t.term}</p>
                <p className="text-xs text-surface-400 leading-relaxed">{t.def}</p>
              </motion.div>
            ))}
          </div>
          <button onClick={() => setActiveId(null)} className="mt-4 w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all">
            ← Back to topics
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Stocks() {
  const [stocks, setStocks]               = useState([]);
  const [daily, setDaily]                 = useState(null);
  const [stockAnalysis, setStockAnalysis] = useState(null);
  const [news, setNews]                   = useState(null);
  const [watchlist, setWatchlist]         = useState([]);
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [, forceTickRender]               = useState(0);
  const refreshTimer = useRef(null);
  const tickTimer    = useRef(null);

  const [loadingMkt,   setLoadingMkt]   = useState(true);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingNews,  setLoadingNews]  = useState(false);
  const [errMkt,    setErrMkt]    = useState('');
  const [errDaily,  setErrDaily]  = useState('');
  const [errStock,  setErrStock]  = useState('');
  const [errNews,   setErrNews]   = useState('');

  const [filter,        setFilter]        = useState('all');
  const [tab,           setTab]           = useState('market');
  const [selectedStock, setSelectedStock] = useState(null);
  const [mktQuery,      setMktQuery]      = useState('');
  const [searchResult,  setSearchResult]  = useState(null);
  const [searching,     setSearching]     = useState(false);
  const [searchErr,     setSearchErr]     = useState('');
  const [analyzeInput,  setAnalyzeInput]  = useState('');
  const mktTimer = useRef(null);

  useEffect(() => {
    loadMarket();
    refreshTimer.current = setInterval(() => loadMarket(true), 2 * 60 * 1000);
    tickTimer.current    = setInterval(() => forceTickRender(n => n + 1), 30 * 1000);
    return () => { clearInterval(refreshTimer.current); clearInterval(tickTimer.current); };
  }, []);

  async function loadMarket(silent = false) {
    if (!silent) { setLoadingMkt(true); setErrMkt(''); }
    try {
      const [mkt, wl] = await Promise.all([api.getMarket(), api.getWatchlist()]);
      setStocks(mkt.stocks || []);
      setWatchlist(wl.watchlist || []);
      setLastUpdated(Date.now());
    } catch (e) {
      if (!silent) setErrMkt(e?.data?.error || 'Could not load market data.');
    } finally { if (!silent) setLoadingMkt(false); }
  }

  function onMktQueryChange(v) {
    setMktQuery(v); setSearchErr('');
    if (!v.trim()) { setSearchResult(null); return; }
    clearTimeout(mktTimer.current);
    mktTimer.current = setTimeout(() => doSearch(v.trim().toUpperCase()), 650);
  }

  async function doSearch(sym) {
    setSearching(true); setSearchResult(null);
    try { const d = await api.searchStock(sym); setSearchResult(d.stock); }
    catch (e) { setSearchErr(e?.data?.error || `No data for "${sym}"`); }
    finally { setSearching(false); }
  }

  async function runDaily() {
    if (loadingDaily) return;
    setLoadingDaily(true); setErrDaily(''); setTab('daily');
    try { setDaily(await api.getDailyPicks(stocks)); }
    catch (e) { setErrDaily(e?.data?.error || 'Daily analysis failed — try again.'); }
    finally { setLoadingDaily(false); }
  }

  async function runStockAnalysis() {
    const sym = analyzeInput.trim().toUpperCase();
    if (!sym) return;
    setLoadingStock(true); setErrStock(''); setStockAnalysis(null);
    try { setStockAnalysis(await api.analyzeStock(sym)); }
    catch (e) { setErrStock(e?.data?.error || `Could not analyze ${sym}.`); }
    finally { setLoadingStock(false); }
  }

  async function runNews() {
    if (loadingNews) return;
    setLoadingNews(true); setErrNews(''); setTab('news');
    try { setNews(await api.getStockNews()); }
    catch (e) { setErrNews(e?.data?.error || 'Could not load news.'); }
    finally { setLoadingNews(false); }
  }

  async function toggleWatchlist(symbol) {
    if (watchlist.includes(symbol)) {
      await api.removeFromWatchlist(symbol); setWatchlist(w => w.filter(s => s !== symbol));
    } else {
      await api.addToWatchlist(symbol); setWatchlist(w => [...w, symbol]);
    }
  }

  const filtered = stocks.filter(s => {
    if (filter === 'watchlist') return watchlist.includes(s.symbol);
    if (filter === 'gainers')   return s.changePct > 0;
    if (filter === 'losers')    return s.changePct < 0;
    return true;
  });
  const gainers = stocks.filter(s => s.changePct > 0).length;
  const losers  = stocks.filter(s => s.changePct < 0).length;

  const TABS = [
    { id: 'market',  label: 'Markets',  icon: 'trending-up',    action: () => setTab('market') },
    { id: 'daily',   label: 'Top Picks',icon: 'sparkles',       action: runDaily },
    { id: 'analyze', label: 'Analyze',  icon: 'magnifying-glass',action: () => setTab('analyze') },
    { id: 'news',    label: 'News',     icon: 'newspaper',      action: runNews },
    { id: 'learn',   label: 'Learn',    icon: 'academic-cap',   action: () => setTab('learn') },
  ];

  return (
    <div className="screen-card pb-28">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="label mb-1">Markets</p>
            <h1 className="text-2xl font-black tracking-tight leading-none">Stock Market</h1>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <MarketStatus />
            {lastUpdated && (
              <span className="text-[9px] text-surface-400 tabular-nums">
                {Math.floor((Date.now() - lastUpdated) / 60000) < 1 ? 'Just updated' : `${Math.floor((Date.now() - lastUpdated) / 60000)}m ago`}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-0.5 -mx-1 px-1">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={t.action}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all active:scale-95 ${
                active
                  ? 'bg-brand-500/12 border-brand-500/30 text-brand-400'
                  : 'bg-surface-800 border-surface-600 text-surface-400 hover:text-surface-200 hover:border-surface-500'
              }`}>
              <Icon name={t.icon} size={13} strokeWidth={active ? 2 : 1.6} />
              <span className="text-xs font-semibold">{t.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ══ MARKET TAB ══ */}
        {tab === 'market' && (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Icon name="magnifying-glass" size={14} className="text-surface-500" />
                </span>
                <input type="text" value={mktQuery} onChange={e => onMktQueryChange(e.target.value)}
                  placeholder="Search any ticker — AAPL, TSLA, QQQ…"
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-9 pr-8 py-2.5 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 transition-colors" />
                {searching && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-xs inline-block">◌</motion.span>}
              </div>
              <AnimatePresence>
                {searchResult && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    onClick={() => setSelectedStock(searchResult.symbol)}
                    className="mt-1.5 bg-surface-800 border border-surface-700 rounded-xl px-3.5 py-3 flex items-center gap-3 cursor-pointer hover:border-brand-500/30 transition-colors">
                    <button onClick={e => { e.stopPropagation(); toggleWatchlist(searchResult.symbol); }}
                      className={`flex-shrink-0 transition-colors ${watchlist.includes(searchResult.symbol) ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}`}>
                      <Icon name="star" size={14} strokeWidth={watchlist.includes(searchResult.symbol) ? 2.5 : 1.6} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{searchResult.symbol}</p>
                      <p className="text-[10px] text-surface-500 truncate">{searchResult.name}</p>
                    </div>
                    <Sparkline data={searchResult.sparkline} positive={searchResult.changePct >= 0} />
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-sm tabular-nums">${searchResult.price?.toFixed(2)}</p>
                      <Pct value={searchResult.changePct} />
                    </div>
                  </motion.div>
                )}
                {searchErr && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 text-xs text-red-400 pl-1">{searchErr}</motion.p>}
              </AnimatePresence>
            </div>

            {/* Market pulse */}
            {!loadingMkt && stocks.length > 0 && (
              <div className="bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3.5 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionLabel>Today&apos;s Pulse</SectionLabel>
                    <p className="font-bold text-sm">{gainers > losers ? 'Mostly climbing' : gainers === losers ? 'Mixed signals' : 'Mostly falling'}</p>
                    <p className="text-[10px] text-surface-500 mt-0.5">{stocks.length} stocks tracked</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center"><p className="text-emerald-400 font-black text-xl tabular-nums leading-none">{gainers}</p><p className="text-[9px] font-bold text-surface-500 uppercase mt-0.5">UP</p></div>
                    <div className="w-px h-7 bg-surface-700" />
                    <div className="text-center"><p className="text-red-400 font-black text-xl tabular-nums leading-none">{losers}</p><p className="text-[9px] font-bold text-surface-500 uppercase mt-0.5">DOWN</p></div>
                  </div>
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              {[['all','All'],['watchlist','Watchlist'],['gainers','Gainers'],['losers','Losers']].map(([f, lbl]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filter === f ? 'bg-brand-500 text-white' : 'bg-surface-800 border border-surface-700 text-surface-500 hover:text-white'}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Stock list */}
            {loadingMkt ? (
              <div className="flex flex-col gap-1.5">{[...Array(8)].map((_, i) => <div key={i} className="h-[64px] rounded-xl bg-surface-800 border border-surface-700 animate-pulse" />)}</div>
            ) : errMkt ? (
              <Err message={errMkt} onRetry={loadMarket} />
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((stock, i) => {
                  const pos = stock.changePct >= 0;
                  const inWL = watchlist.includes(stock.symbol);
                  return (
                    <motion.div key={stock.symbol}
                      initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.01, 0.3) }}
                      onClick={() => setSelectedStock(stock.symbol)}
                      className="bg-surface-800 border border-surface-700 rounded-xl px-3.5 py-3 hover:border-surface-600 hover:bg-surface-800/80 transition-all cursor-pointer active:scale-[0.99]">
                      <div className="flex items-center gap-3">
                        <button onClick={e => { e.stopPropagation(); toggleWatchlist(stock.symbol); }}
                          className={`flex-shrink-0 transition-colors ${inWL ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}`}>
                          <Icon name="star" size={14} strokeWidth={inWL ? 2.5 : 1.6} />
                  </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm tracking-tight">{stock.symbol}</p>
                          <p className="text-[10px] text-surface-500 truncate leading-tight">{stock.name}</p>
                        </div>
                        <Sparkline data={stock.sparkline} positive={pos} />
                        <div className="text-right flex-shrink-0 w-[72px]">
                          <p className="font-black text-sm tabular-nums">${stock.price?.toFixed(2)}</p>
                          <Pct value={stock.changePct} />
                        </div>
                      </div>
                      {/* Second row: market cap + volume if available */}
                      {(stock.marketCap || stock.volume) && (
                        <div className="flex items-center gap-2 mt-1.5 pl-6">
                          {stock.marketCap && <span className="text-[9px] text-surface-600 font-medium">{formatNum(stock.marketCap, '$')}</span>}
                          {stock.marketCap && stock.volume && <span className="text-[9px] text-surface-700">·</span>}
                          {stock.volume && <span className="text-[9px] text-surface-600">Vol {formatNum(stock.volume)}</span>}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center py-10 text-center gap-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#1a1a26', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Icon name={filter === 'watchlist' ? 'star' : 'magnifying-glass'} size={18} className="text-surface-500" />
                    </div>
                    <p className="text-sm text-surface-500">{filter === 'watchlist' ? 'Tap the star to add stocks to your watchlist' : 'No stocks match this filter'}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ══ DAILY TOP 5 TAB ══ */}
        {tab === 'daily' && (
          <motion.div key="daily" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loadingDaily ? (
              <Loader title="Scanning today's market…" sub="Fetching live data · RSI · News · Analyst ratings · Insider data — ~30s" />
            ) : errDaily ? (
              <Err message={errDaily} onRetry={runDaily} />
            ) : daily ? (
              <div className="flex flex-col gap-3">
                <div className="bg-surface-800 border border-surface-700 rounded-2xl p-4">
                  <SectionLabel>Today&apos;s Market Theme</SectionLabel>
                  <p className="font-bold text-sm text-white leading-snug">{daily.marketTheme}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={daily.marketMood === 'bullish' ? 'bullish' : daily.marketMood === 'bearish' ? 'bearish' : 'neutral'}>
                      {daily.marketMood === 'bullish' ? '🐂' : daily.marketMood === 'bearish' ? '🐻' : '😐'} {daily.marketMood}
                    </Badge>
                    {daily.patternOfDay && <Badge variant="purple">🕯 {daily.patternOfDay.pattern}</Badge>}
                  </div>
                </div>
                {daily.patternOfDay && (
                  <div className="bg-surface-800 border border-purple-500/25 rounded-2xl p-4">
                    <SectionLabel>🕯 Pattern of the Day · {daily.patternOfDay.stock}</SectionLabel>
                    <p className="font-bold text-sm text-white mb-1">{daily.patternOfDay.pattern}</p>
                    <p className="text-xs text-surface-400 leading-relaxed">{daily.patternOfDay.explanation}</p>
                  </div>
                )}
                <div className="h-px bg-surface-700" />
                <div className="flex items-center justify-between">
                  <SectionLabel>Today&apos;s Picks ({daily.topPicks?.length ?? 0}) · 80+ confidence only</SectionLabel>
                </div>
                {daily.topPicks?.length > 0
                  ? daily.topPicks.map((pick, i) => <DailyPickCard key={pick.symbol} pick={pick} index={i} />)
                  : (
                    <div className="bg-surface-900 border border-surface-700 rounded-xl p-5 text-center">
                      <p className="text-2xl mb-2">🔍</p>
                      <p className="text-sm font-semibold text-white mb-1">No high-conviction picks today</p>
                      <p className="text-xs text-surface-400 leading-relaxed">No stocks met the 80/100 threshold. Check back later or re-run.</p>
                    </div>
                  )}
                <p className="text-[10px] text-surface-600 text-center leading-relaxed px-2 mt-1">⚠️ {daily.disclaimer}</p>
                <button onClick={runDaily} className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all">
                  🔄 Re-run analysis
                </button>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* ══ ANALYZE TAB ══ */}
        {tab === 'analyze' && (
          <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-5">
              <SectionLabel>Stock Deep Dive</SectionLabel>
              <p className="text-xs text-surface-500 mb-3">Enter any ticker for a full AI technical breakdown — candlesticks, RSI, MAs, support/resistance, and 30-day outlook.</p>
              <div className="flex gap-2">
                <input type="text" value={analyzeInput} onChange={e => setAnalyzeInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && runStockAnalysis()}
                  placeholder="e.g. AAPL, TSLA, NVDA…" maxLength={10}
                  className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm font-bold placeholder:text-surface-500 placeholder:font-normal focus:outline-none focus:border-brand-500/60 transition-colors" />
                <button onClick={runStockAnalysis} disabled={!analyzeInput.trim() || loadingStock}
                  className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-bold disabled:opacity-40 active:scale-95 transition-all flex-shrink-0">
                  Analyze
                </button>
              </div>
            </div>
            {loadingStock ? (
              <Loader title={`Analyzing ${analyzeInput}…`} sub="Fetching 60 days of data · Candlestick patterns · RSI · MAs — ~15s" />
            ) : errStock ? (
              <Err message={errStock} onRetry={runStockAnalysis} />
            ) : stockAnalysis ? (
              <StockAnalysisResult data={stockAnalysis} onClear={() => { setStockAnalysis(null); setAnalyzeInput(''); }} />
            ) : (
              <div>
                <SectionLabel>Popular to analyze</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {['AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL','COIN','PLTR','AMD'].map(sym => (
                    <button key={sym} onClick={() => setAnalyzeInput(sym)}
                      className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs font-bold text-surface-400 hover:text-white hover:border-surface-600 transition-colors">
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ══ NEWS TAB ══ */}
        {tab === 'news' && (
          <motion.div key="news" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loadingNews ? (
              <Loader title="Scanning the news…" sub="Pulling live headlines · AI analysis — ~15s" />
            ) : errNews ? (
              <Err message={errNews} onRetry={runNews} />
            ) : news ? (
              <div className="flex flex-col gap-3">
                <div className={`bg-surface-800 border rounded-2xl p-4 ${news.fearGreed === 'greed' ? 'border-emerald-500/25' : news.fearGreed === 'fear' ? 'border-red-500/25' : 'border-surface-700'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel>Market Pulse · {new Date(news.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</SectionLabel>
                    <Badge variant={news.fearGreed === 'greed' ? 'bullish' : news.fearGreed === 'fear' ? 'bearish' : 'neutral'}>
                      {news.fearGreed === 'greed' ? '😤 Greed' : news.fearGreed === 'fear' ? '😨 Fear' : '😐 Neutral'}
                    </Badge>
                  </div>
                  <p className="text-sm font-bold text-white leading-snug">{news.marketPulse}</p>
                  {news.hotSector && <p className="text-xs text-surface-500 mt-1.5">Hot sector: <span className="text-white font-semibold">{news.hotSector}</span></p>}
                </div>
                <div className="h-px bg-surface-700" />
                <SectionLabel>Latest Stories · {news.events?.length} articles</SectionLabel>
                {news.events?.map((e, i) => <EventCard key={i} event={e} index={i} />)}
                <button onClick={runNews} className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all mt-1">
                  🔄 Refresh
                </button>
                <p className="text-[10px] text-surface-600 text-center px-4">⚠️ AI-generated analysis. Not financial advice.</p>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* ══ LEARN TAB ══ */}
        {tab === 'learn' && (
          <motion.div key="learn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-4">
              <h2 className="text-base font-black tracking-tight">Stock Market 101</h2>
              <p className="text-xs text-surface-400 mt-0.5">6 topics · plain English, no jargon</p>
            </div>
            <LearnTab />
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Stock detail sheet ──────────────────────────────────────── */}
      <AnimatePresence>
        {selectedStock && (
          <StockDetailSheet
            symbol={selectedStock}
            onClose={() => setSelectedStock(null)}
            onAnalyze={(sym) => { setSelectedStock(null); setAnalyzeInput(sym); setTab('analyze'); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
