import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

// ─── Shared micro-components ─────────────────────────────────────────────────

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 52, H = 22;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ');
  const color = positive ? '#22c55e' : '#ef4444';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

// ─── Format large numbers (market cap, volume) ───────────────────────────────
function formatNum(n, prefix = '') {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${prefix}${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${prefix}${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${prefix}${(n / 1e3).toFixed(1)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

// ─── Interactive price chart ──────────────────────────────────────────────────
function PriceChart({ data, positive }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  if (!data || data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-surface-500">
        No chart data
      </div>
    );
  }

  const W = 320, H = 110, PT = 8, PR = 4, PB = 20, PL = 0;
  const closes = data.map(d => d.close);
  const minV   = Math.min(...closes);
  const maxV   = Math.max(...closes);
  const rangeV = maxV - minV || 1;

  const xp = i => PL + (i / (data.length - 1)) * (W - PL - PR);
  const yp = v => PT + (1 - (v - minV) / rangeV) * (H - PT - PB);

  const linePoints = data.map((d, i) => `${xp(i)},${yp(d.close)}`).join(' ');
  const areaD = `M${xp(0)},${yp(data[0].close)} ` +
    data.slice(1).map((d, i) => `L${xp(i + 1)},${yp(d.close)}`).join(' ') +
    ` L${xp(data.length - 1)},${H - PB} L${xp(0)},${H - PB} Z`;

  const color = positive ? '#22c55e' : '#ef4444';

  function onMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect   = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX   = ((clientX - rect.left) / rect.width) * W;
    const raw    = (relX - PL) / (W - PL - PR) * (data.length - 1);
    const i      = Math.max(0, Math.min(data.length - 1, Math.round(raw)));
    setHover({ i, cx: xp(i), cy: yp(data[i].close), d: data[i] });
  }

  return (
    <div className="relative w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ touchAction: 'none' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0"    />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#cg)" />
        <polyline fill="none" stroke={color} strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" points={linePoints} />
        {hover && (
          <>
            <line x1={hover.cx} y1={PT} x2={hover.cx} y2={H - PB}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,2" />
            <circle cx={hover.cx} cy={hover.cy} r="3.5"
              fill={color} stroke="#15151a" strokeWidth="2" />
          </>
        )}
        <text x={PL}     y={H} fontSize="8" fill="#52525b">{data[0]?.date}</text>
        <text x={W - PR} y={H} fontSize="8" fill="#52525b" textAnchor="end">{data.at(-1)?.date}</text>
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

function Pct({ value }) {
  const pos = value >= 0;
  return (
    <span className={`text-xs font-bold tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{value?.toFixed(2)}%
    </span>
  );
}

function Badge({ children, variant = 'zinc' }) {
  const variants = {
    bullish:  'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    bearish:  'bg-red-500/12    text-red-400    border-red-500/25',
    neutral:  'bg-amber-500/12  text-amber-400  border-amber-500/25',
    high:     'bg-red-500/12    text-red-400    border-red-500/25',
    medium:   'bg-amber-500/12  text-amber-400  border-amber-500/25',
    low:      'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    brand:    'bg-brand-500/12  text-brand-400  border-brand-500/25',
    purple:   'bg-purple-500/12 text-purple-400  border-purple-500/25',
    zinc:     'bg-surface-700   text-surface-400 border-surface-600',
    green:    'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
    red:      'bg-red-500/12    text-red-400    border-red-500/25',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${variants[variant] || variants.zinc}`}>
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return <p className="text-[9px] font-black tracking-[0.12em] uppercase text-surface-500 mb-1.5">{children}</p>;
}

function MarketStatus() {
  const now = new Date();
  // Convert to ET (UTC-4 during EDT, UTC-5 during EST)
  const etOffset = -4; // EDT (May is summer time)
  const et = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);
  const day = et.getDay(); // 0=Sun, 6=Sat
  const hour = et.getHours();
  const min  = et.getMinutes();
  const timeNum = hour * 100 + min;

  const isWeekend = day === 0 || day === 6;
  const isOpen    = !isWeekend && timeNum >= 930 && timeNum < 1600;

  if (isOpen) {
    return (
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-bold text-emerald-400">Market Open</span>
      </div>
    );
  }

  const nextOpen = day === 6 ? 'Mon 9:30 AM ET'
    : day === 0 ? 'Mon 9:30 AM ET'
    : timeNum < 930 ? 'Today 9:30 AM ET'
    : 'Mon 9:30 AM ET';

  return (
    <div className="flex items-center gap-1.5 mb-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-surface-500" />
      <span className="text-xs font-bold text-surface-500">Closed · Opens {nextOpen}</span>
    </div>
  );
}

function HR() { return <div className="h-px bg-surface-700 my-4" />; }

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

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 52 }) {
  const r = 18, circ = 2 * Math.PI * r;
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#26262c" strokeWidth="3.5" />
        <motion.circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${(score / 100) * circ} ${circ}` }}
          transition={{ duration: 1, ease: 'easeOut' }} />
      </svg>
      <span className="absolute text-[11px] font-black tabular-nums" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Daily pick card ──────────────────────────────────────────────────────────
function DailyPickCard({ pick, index }) {
  const [open, setOpen] = useState(false);
  const sc = pick.sentiment === 'bullish' ? 'bullish' : pick.sentiment === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />

      <div className="ml-1 px-4 pt-4 pb-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">{pick.emoji}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-base tracking-tight">{pick.symbol}</span>
                <Badge variant={sc}>{pick.sentiment}</Badge>
                <Badge variant={pick.riskLevel}>{pick.riskLevel} risk</Badge>
              </div>
              <p className="text-[11px] text-surface-500 mt-0.5">{pick.name}</p>
            </div>
          </div>
          <ScoreRing score={pick.technicalScore ?? 50} />
        </div>

        {/* Why today */}
        <div className="bg-surface-900 border border-surface-700 rounded-xl p-3 mb-3">
          <SectionLabel>Why Today</SectionLabel>
          <p className="text-xs text-surface-300 leading-relaxed">{pick.whyToday}</p>
        </div>

        {/* Signal chips */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[
            { lbl: '🕯 Pattern', val: pick.candlestickPattern },
            { lbl: 'RSI',        val: pick.rsiReading },
            { lbl: 'Volume',     val: pick.volumeRead },
          ].filter(x => x.val).map(({ lbl, val }) => (
            <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-lg p-2">
              <SectionLabel>{lbl}</SectionLabel>
              <p className="text-[10px] text-surface-200 leading-tight line-clamp-2">{val}</p>
            </div>
          ))}
        </div>

        {/* Levels */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2">
            <SectionLabel>Support</SectionLabel>
            <p className="text-sm font-bold text-emerald-400">{pick.support}</p>
          </div>
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2">
            <SectionLabel>Resistance</SectionLabel>
            <p className="text-sm font-bold text-red-400">{pick.resistance}</p>
          </div>
        </div>

        {/* Expand */}
        <button onClick={() => setOpen(o => !o)}
          className="text-[11px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
          {open ? '↑ Collapse' : '↓ Full breakdown'}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-surface-700">
                {[
                  { lbl: 'Candlestick Meaning', val: pick.candlestickMeaning },
                  { lbl: 'Moving Averages',     val: pick.maSetup },
                  { lbl: '1–3 Day Outlook',     val: pick.shortOutlook },
                  { lbl: 'This Week',           val: pick.weekOutlook },
                  { lbl: '⚠️ Key Risk',          val: pick.keyRisk },
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

// ─── Single stock analysis result ────────────────────────────────────────────
function StockAnalysisResult({ data, onClear }) {
  const [open, setOpen] = useState(false);
  const sc = data.sentiment === 'bullish' ? 'bullish' : data.sentiment === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];

  const verdictColor = {
    'Strong Buy': 'text-emerald-400', 'Buy': 'text-emerald-400',
    'Hold': 'text-amber-400',
    'Sell': 'text-red-400', 'Strong Sell': 'text-red-400',
  }[data.verdict] || 'text-white';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />

      <div className="ml-1 px-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">{data.emoji}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-lg tracking-tight">{data.symbol}</span>
                <Badge variant={sc}>{data.sentiment}</Badge>
                <Badge variant={data.riskLevel}>{data.riskLevel} risk</Badge>
              </div>
              <p className="text-[11px] text-surface-500">{data.name}</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={data.technicalScore ?? 50} size={56} />
          </div>
        </div>

        {/* Verdict */}
        <div className="bg-surface-900 border border-surface-700 rounded-xl p-3 mb-3 flex items-center justify-between">
          <div>
            <SectionLabel>AI Verdict</SectionLabel>
            <p className={`text-lg font-black ${verdictColor}`}>{data.verdict}</p>
          </div>
          <div className="text-right">
            <SectionLabel>Conviction</SectionLabel>
            <Badge variant={data.conviction === 'high' ? 'green' : data.conviction === 'low' ? 'red' : 'neutral'}>
              {data.conviction}
            </Badge>
          </div>
        </div>

        {/* Snapshot */}
        <p className="text-sm text-surface-300 leading-relaxed mb-3">{data.snapshot}</p>

        {/* Key signals */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {[
            { lbl: '🕯 Pattern',   val: data.candlestickPattern },
            { lbl: 'RSI',          val: data.rsiAnalysis },
            { lbl: 'Moving Avgs',  val: data.maAnalysis },
            { lbl: 'Volume',       val: data.volumeAnalysis },
          ].filter(x => x.val).map(({ lbl, val }) => (
            <div key={lbl} className="bg-surface-900 border border-surface-700 rounded-lg p-2">
              <SectionLabel>{lbl}</SectionLabel>
              <p className="text-[10px] text-surface-200 leading-tight line-clamp-3">{val}</p>
            </div>
          ))}
        </div>

        {/* Support / Resistance */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2">
            <SectionLabel>Support</SectionLabel>
            <p className="text-sm font-bold text-emerald-400">{data.support}</p>
          </div>
          <div className="flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2">
            <SectionLabel>Resistance</SectionLabel>
            <p className="text-sm font-bold text-red-400">{data.resistance}</p>
          </div>
        </div>

        {/* Expand */}
        <button onClick={() => setOpen(o => !o)}
          className="text-[11px] font-bold text-brand-400 hover:text-brand-300 transition-colors">
          {open ? '↑ Less' : '↓ Full outlook & risks'}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-surface-700">
                {[
                  { lbl: 'Candlestick Meaning',   val: data.candlestickMeaning },
                  { lbl: 'Price Position (52-wk)', val: data.pricePosition },
                  { lbl: '1–3 Day Outlook',        val: data.outlook1to3days },
                  { lbl: 'This Week',              val: data.outlookThisWeek },
                  { lbl: 'Next Month (if trend)',   val: data.outlookNextMonth },
                  { lbl: '⚠️ Top Risk',             val: data.topRisk },
                  { lbl: '👀 Watch For',            val: data.watchFor },
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

        <button onClick={onClear}
          className="mt-4 w-full py-2 rounded-xl bg-surface-900 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white transition-colors">
          Analyze another stock
        </button>
      </div>
    </motion.div>
  );
}

// ─── News event card ──────────────────────────────────────────────────────────
function EventCard({ event, index }) {
  const sc = event.impact === 'bullish' ? 'bullish' : event.impact === 'bearish' ? 'bearish' : 'neutral';
  const barColor = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#f59e0b' }[sc];
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="relative bg-surface-800 border border-surface-700 rounded-2xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: barColor }} />
      <div className="ml-1 px-4 pt-3.5 pb-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{event.emoji}</span>
            <Badge variant="zinc">{event.category}</Badge>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Badge variant={event.impactLevel === 'high' ? 'red' : event.impactLevel === 'low' ? 'low' : 'medium'}>
              {event.impactLevel}
            </Badge>
            <Badge variant={sc}>{event.impact}</Badge>
          </div>
        </div>
        <p className="text-sm font-bold text-white leading-snug mb-2">{event.headline}</p>
        <p className="text-xs text-surface-400 leading-relaxed mb-3">{event.summary}</p>
        <div className="flex flex-wrap gap-1.5">
          {event.sectors?.map(s => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-surface-700 text-surface-400 border border-surface-600 font-medium">{s}</span>
          ))}
          {event.watchTickers?.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-bold">{t}</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stock detail bottom sheet ────────────────────────────────────────────────
const RANGES = ['1W', '1M', '3M', '6M', '1Y'];

function StockDetailSheet({ symbol, onClose, onAnalyze }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [range,   setRange]   = useState('1M');

  // Lock background scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Reload when symbol OR range changes
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
  const f   = detail?.fundamentals || {};

  const pctInRange = (f.low52 != null && f.high52 != null && detail?.price != null)
    ? Math.max(0, Math.min(100, ((detail.price - f.low52) / (f.high52 - f.low52)) * 100))
    : null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="bd"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        key="sh"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f14] border-t border-surface-700 rounded-t-[28px] max-h-[90vh] overflow-y-auto"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-[#0f0f14] z-10">
          <div className="w-10 h-1 rounded-full bg-surface-700" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            {detail ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-black tracking-tight">{detail.symbol}</h2>
                  <span className={`text-sm font-bold tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pos ? '+' : ''}{detail.change?.toFixed(2)} ({pos ? '+' : ''}{detail.changePct?.toFixed(2)}%)
                  </span>
                </div>
                <p className="text-xs text-surface-500 truncate mt-0.5">{detail.name}</p>
              </>
            ) : (
              <h2 className="text-2xl font-black tracking-tight">{symbol}</h2>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {detail && (
              <span className="text-xl font-black tabular-nums">${detail.price?.toFixed(2)}</span>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-white text-xs font-bold transition-colors">
              ✕
            </button>
          </div>
        </div>

        {/* Range tabs */}
        <div className="flex gap-1.5 px-5 mb-4">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all active:scale-95 ${
                range === r
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-800 border border-surface-700 text-surface-500 hover:text-white'
              }`}>
              {r}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="px-5 mb-5">
          <SectionLabel>Price History</SectionLabel>
          {loading ? (
            <div className="h-[110px] flex items-center justify-center">
              <motion.div className="w-6 h-6 rounded-full border-2 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent"
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
            </div>
          ) : err ? (
            <div className="h-24 flex items-center justify-center text-xs text-surface-500">{err}</div>
          ) : detail?.chart ? (
            <PriceChart data={detail.chart} positive={pos} />
          ) : null}
        </div>

        {/* Fundamentals */}
        {detail && !loading && (
          <div className="px-5 pb-8">

            {/* 52-week range bar */}
            {f.high52 != null && f.low52 != null && (
              <div className="bg-surface-800 border border-surface-700 rounded-2xl p-3.5 mb-3">
                <SectionLabel>52-Week Range</SectionLabel>
                <div className="flex items-center justify-between text-[10px] text-surface-400 mb-2">
                  <span className="font-bold">${f.low52?.toFixed(2)}</span>
                  <span className="text-[9px] text-surface-600 font-semibold">
                    {pctInRange != null ? `${pctInRange.toFixed(0)}% of range` : ''}
                  </span>
                  <span className="font-bold">${f.high52?.toFixed(2)}</span>
                </div>
                <div className="relative h-2 bg-surface-700 rounded-full overflow-visible">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 opacity-50" />
                  {pctInRange != null && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#0f0f14] shadow-md z-10"
                      style={{ left: `calc(${pctInRange}% - 7px)` }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Metrics 2×4 grid */}
            <SectionLabel>Key Metrics</SectionLabel>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { lbl: 'P/E Ratio (TTM)',  val: f.pe        != null ? f.pe.toFixed(1)              : '—' },
                { lbl: 'Forward P/E',      val: f.forwardPe != null ? f.forwardPe.toFixed(1)       : '—' },
                { lbl: 'EPS (TTM)',        val: f.eps       != null ? `$${f.eps.toFixed(2)}`       : '—' },
                { lbl: 'Beta',             val: f.beta      != null ? f.beta.toFixed(2)             : '—' },
                { lbl: 'Dividend Yield',   val: f.dividendYield != null ? `${f.dividendYield}%`    : '—' },
                { lbl: 'Annual Dividend',  val: f.dividendRate  != null ? `$${f.dividendRate.toFixed(2)}` : '—' },
                { lbl: 'Market Cap',       val: formatNum(f.marketCap, '$') },
                { lbl: 'Volume',           val: formatNum(f.volume) },
              ].map(({ lbl, val }) => (
                <div key={lbl} className="bg-surface-800 border border-surface-700 rounded-xl p-3">
                  <SectionLabel>{lbl}</SectionLabel>
                  <p className="text-sm font-black text-white">{val}</p>
                </div>
              ))}
            </div>

            {/* Deep dive CTA */}
            <button
              onClick={() => { onClose(); onAnalyze(symbol); }}
              className="w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-black active:scale-[0.98] transition-all shadow-lg shadow-brand-500/20">
              🔬 Deep Dive Analysis
            </button>

            <p className="text-[10px] text-surface-600 text-center mt-3 px-4">
              ⚠️ Price data from Yahoo Finance. Not financial advice.
            </p>
          </div>
        )}
      </motion.div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Stocks() {
  const [stocks, setStocks]                 = useState([]);
  const [daily, setDaily]                   = useState(null);
  const [stockAnalysis, setStockAnalysis]   = useState(null);
  const [news, setNews]                     = useState(null);
  const [watchlist, setWatchlist]           = useState([]);

  const [loadingMkt, setLoadingMkt]         = useState(true);
  const [loadingDaily, setLoadingDaily]     = useState(false);
  const [loadingStock, setLoadingStock]     = useState(false);
  const [loadingNews, setLoadingNews]       = useState(false);

  const [errMkt, setErrMkt]                 = useState('');
  const [errDaily, setErrDaily]             = useState('');
  const [errStock, setErrStock]             = useState('');
  const [errNews, setErrNews]               = useState('');

  const [filter, setFilter]                 = useState('all');
  const [tab, setTab]                       = useState('market');
  const [selectedStock, setSelectedStock]   = useState(null);

  // Market search
  const [mktQuery, setMktQuery]             = useState('');
  const [searchResult, setSearchResult]     = useState(null);
  const [searching, setSearching]           = useState(false);
  const [searchErr, setSearchErr]           = useState('');
  const mktTimer = useRef(null);

  // Stock analyzer input
  const [analyzeInput, setAnalyzeInput]     = useState('');

  useEffect(() => { loadMarket(); }, []);

  async function loadMarket() {
    setLoadingMkt(true); setErrMkt('');
    try {
      const [mkt, wl] = await Promise.all([api.getMarket(), api.getWatchlist()]);
      setStocks(mkt.stocks || []);
      setWatchlist(wl.watchlist || []);
    } catch (e) {
      setErrMkt(e?.data?.error || 'Could not load market data.');
    } finally { setLoadingMkt(false); }
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
    catch (e) { setErrStock(e?.data?.error || `Could not analyze ${sym} — check the ticker.`); }
    finally { setLoadingStock(false); }
  }

  async function runNews() {
    if (loadingNews) return;
    setLoadingNews(true); setErrNews(''); setTab('events');
    try { setNews(await api.getStockNews()); }
    catch (e) { setErrNews(e?.data?.error || 'Could not load news — try again.'); }
    finally { setLoadingNews(false); }
  }

  async function toggleWatchlist(symbol) {
    if (watchlist.includes(symbol)) {
      await api.removeFromWatchlist(symbol);
      setWatchlist(w => w.filter(s => s !== symbol));
    } else {
      await api.addToWatchlist(symbol);
      setWatchlist(w => [...w, symbol]);
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
  const bullish = gainers > losers;

  const TABS = [
    { id: 'market',  label: 'Market',   icon: '📊', sub: 'Live prices',      action: () => setTab('market') },
    { id: 'daily',   label: 'Top 5',    icon: '🏆', sub: "Today's picks",    action: runDaily },
    { id: 'analyze', label: 'Analyze',  icon: '🔬', sub: 'Deep dive',        action: () => setTab('analyze') },
    { id: 'events',  label: 'Events',   icon: '📰', sub: 'Market news',      action: runNews },
  ];

  return (
    <div className="screen-card pb-28">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <SectionLabel>Markets</SectionLabel>
        <div className="flex items-end justify-between">
          <h1 className="text-[26px] font-black tracking-tight leading-none">Stock Market</h1>
          <MarketStatus />
        </div>
      </motion.div>

      {/* ── Tab grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={t.action}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-all active:scale-95 ${
                active
                  ? 'bg-brand-500/12 border-brand-500/40 text-brand-400'
                  : 'bg-surface-800 border-surface-700 text-surface-500 hover:border-surface-600 hover:text-surface-300'
              }`}>
              <span className="text-xl leading-none">{t.icon}</span>
              <span className={`text-[11px] font-black leading-none ${active ? 'text-brand-400' : 'text-surface-400'}`}>{t.label}</span>
              <span className={`text-[9px] leading-none ${active ? 'text-brand-400/70' : 'text-surface-600'}`}>{t.sub}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ══════════════ MARKET TAB ══════════════ */}
        {tab === 'market' && (
          <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-sm select-none">⌕</span>
                <input type="text" value={mktQuery} onChange={e => onMktQueryChange(e.target.value)}
                  placeholder="Search any ticker — AAPL, BTC-USD, QQQ…"
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl pl-9 pr-8 py-2.5 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 transition-colors" />
                {searching && (
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-500 text-xs inline-block">◌</motion.span>
                )}
              </div>
              <AnimatePresence>
                {searchResult && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    onClick={() => setSelectedStock(searchResult.symbol)}
                    className="mt-1.5 bg-surface-800 border border-surface-700 rounded-xl px-3.5 py-3 flex items-center gap-3 cursor-pointer hover:border-surface-600 transition-colors">
                    <button onClick={e => { e.stopPropagation(); toggleWatchlist(searchResult.symbol); }}
                      className={`text-base flex-shrink-0 transition-colors ${watchlist.includes(searchResult.symbol) ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}`}>★</button>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{searchResult.symbol}</p>
                      <p className="text-[10px] text-surface-500 truncate">{searchResult.name}</p>
                    </div>
                    <Sparkline data={searchResult.sparkline} positive={searchResult.changePct >= 0} />
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-sm tabular-nums">${searchResult.price?.toFixed(2)}</p>
                      <div className="flex justify-end"><Pct value={searchResult.changePct} /></div>
                    </div>
                  </motion.div>
                )}
                {searchErr && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="mt-1 text-xs text-red-400 pl-1">{searchErr}</motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Market pulse */}
            {!loadingMkt && stocks.length > 0 && (
              <div className="bg-surface-800 border border-surface-700 rounded-2xl px-4 py-3.5 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <SectionLabel>Today's Pulse</SectionLabel>
                    <p className="font-bold text-sm">
                      {bullish ? 'Mostly climbing 📈' : gainers === losers ? 'Mixed signals ↔️' : 'Mostly falling 📉'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-emerald-400 font-black text-xl tabular-nums leading-none">{gainers}</p>
                      <p className="text-[9px] font-bold tracking-widest text-surface-500 uppercase mt-0.5">UP</p>
                    </div>
                    <div className="w-px h-7 bg-surface-700" />
                    <div className="text-center">
                      <p className="text-red-400 font-black text-xl tabular-nums leading-none">{losers}</p>
                      <p className="text-[9px] font-bold tracking-widest text-surface-500 uppercase mt-0.5">DOWN</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              {[['all','All'],['watchlist','⭐ Watchlist'],['gainers','▲ Gainers'],['losers','▼ Losers']].map(([f, lbl]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    filter === f ? 'bg-brand-500 text-white' : 'bg-surface-800 border border-surface-700 text-surface-500 hover:text-white'
                  }`}>{lbl}</button>
              ))}
            </div>

            {/* Stock list */}
            {loadingMkt ? (
              <div className="flex flex-col gap-1.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-[58px] rounded-xl bg-surface-800 border border-surface-700 animate-pulse" />
                ))}
              </div>
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
                      transition={{ delay: i * 0.015 }}
                      onClick={() => setSelectedStock(stock.symbol)}
                      className="bg-surface-800 border border-surface-700 rounded-xl flex items-center gap-3 px-3.5 py-3 hover:border-surface-600 transition-colors cursor-pointer active:scale-[0.99]">
                      <button onClick={e => { e.stopPropagation(); toggleWatchlist(stock.symbol); }}
                        className={`text-sm flex-shrink-0 transition-colors ${inWL ? 'text-amber-400' : 'text-surface-600 hover:text-surface-400'}`}>★</button>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm tracking-tight">{stock.symbol}</p>
                        <p className="text-[10px] text-surface-500 truncate">{stock.name}</p>
                      </div>
                      <Sparkline data={stock.sparkline} positive={pos} />
                      <div className="text-right flex-shrink-0 w-[72px]">
                        <p className="font-black text-sm tabular-nums">${stock.price?.toFixed(2)}</p>
                        <div className="flex justify-end"><Pct value={stock.changePct} /></div>
                      </div>
                    </motion.div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-3xl mb-2">{filter === 'watchlist' ? '⭐' : '🔍'}</p>
                    <p className="text-sm text-surface-500">
                      {filter === 'watchlist' ? 'Tap ★ on any stock to add it to your watchlist' : 'No stocks match this filter'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════ DAILY TOP 5 TAB ══════════════ */}
        {tab === 'daily' && (
          <motion.div key="daily" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loadingDaily ? (
              <Loader title="Scanning today's market…" sub="Fetching live OHLCV · Reading candlesticks · RSI · Volume — ~25s" />
            ) : errDaily ? (
              <Err message={errDaily} onRetry={runDaily} />
            ) : daily ? (
              <div className="flex flex-col gap-3">

                {/* Header card */}
                <div className="bg-surface-800 border border-surface-700 rounded-2xl p-4">
                  <SectionLabel>Today's Market Theme</SectionLabel>
                  <p className="font-bold text-sm text-white leading-snug">{daily.marketTheme}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={daily.marketMood === 'bullish' ? 'bullish' : daily.marketMood === 'bearish' ? 'bearish' : 'neutral'}>
                      {daily.marketMood === 'bullish' ? '🐂' : daily.marketMood === 'bearish' ? '🐻' : '😐'} {daily.marketMood}
                    </Badge>
                    {daily.patternOfDay && <Badge variant="purple">🕯 {daily.patternOfDay.pattern}</Badge>}
                  </div>
                </div>

                {/* Pattern of the day */}
                {daily.patternOfDay && (
                  <div className="bg-surface-800 border border-purple-500/25 rounded-2xl p-4">
                    <SectionLabel>🕯 Pattern of the Day · {daily.patternOfDay.stock}</SectionLabel>
                    <p className="font-bold text-sm text-white mb-1">{daily.patternOfDay.pattern}</p>
                    <p className="text-xs text-surface-400 leading-relaxed">{daily.patternOfDay.explanation}</p>
                  </div>
                )}

                <HR />
                <SectionLabel>Today's Top 5 · {daily.stocksAnalyzed?.join(' · ')}</SectionLabel>

                {daily.topPicks?.map((pick, i) => <DailyPickCard key={pick.symbol} pick={pick} index={i} />)}

                <p className="text-[10px] text-surface-600 text-center leading-relaxed px-2 mt-1">
                  ⚠️ {daily.disclaimer}
                </p>
                <button onClick={runDaily}
                  className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all">
                  🔄 Re-run analysis
                </button>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* ══════════════ ANALYZE STOCK TAB ══════════════ */}
        {tab === 'analyze' && (
          <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-5">
              <SectionLabel>Stock Deep Dive</SectionLabel>
              <p className="text-xs text-surface-500 mb-3">Enter any ticker for a full technical breakdown — candlesticks, RSI, moving averages, support/resistance, and outlook.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={analyzeInput}
                  onChange={e => setAnalyzeInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && runStockAnalysis()}
                  placeholder="e.g. AAPL, TSLA, NVDA…"
                  maxLength={10}
                  className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-4 py-2.5 text-sm font-bold placeholder:text-surface-500 placeholder:font-normal focus:outline-none focus:border-brand-500/60 transition-colors" />
                <button onClick={runStockAnalysis} disabled={!analyzeInput.trim() || loadingStock}
                  className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-bold disabled:opacity-40 active:scale-95 transition-all flex-shrink-0">
                  Analyze
                </button>
              </div>
            </div>

            {loadingStock ? (
              <Loader title={`Analyzing ${analyzeInput}…`} sub="Fetching 60 days of OHLCV · Reading patterns · RSI · MAs — ~15s" />
            ) : errStock ? (
              <Err message={errStock} onRetry={runStockAnalysis} />
            ) : stockAnalysis ? (
              <StockAnalysisResult data={stockAnalysis} onClear={() => { setStockAnalysis(null); setAnalyzeInput(''); }} />
            ) : (
              <div className="flex flex-col gap-3">
                <SectionLabel>Popular to analyze</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {['AAPL','TSLA','NVDA','MSFT','AMZN','META','GOOGL','COIN','PLTR','AMD'].map(sym => (
                    <button key={sym} onClick={() => { setAnalyzeInput(sym); }}
                      className="px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700 text-xs font-bold text-surface-400 hover:text-white hover:border-surface-600 transition-colors">
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════ EVENTS TAB ══════════════ */}
        {tab === 'events' && (
          <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loadingNews ? (
              <Loader title="Scanning the news…" sub="Pulling live headlines · AI analysis — ~15s" />
            ) : errNews ? (
              <Err message={errNews} onRetry={runNews} />
            ) : news ? (
              <div className="flex flex-col gap-3">
                {/* Pulse card */}
                <div className={`bg-surface-800 border rounded-2xl p-4 ${
                  news.fearGreed === 'greed' ? 'border-emerald-500/25' :
                  news.fearGreed === 'fear'  ? 'border-red-500/25'     : 'border-surface-700'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <SectionLabel>
                      Market Pulse · {new Date(news.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </SectionLabel>
                    <Badge variant={news.fearGreed === 'greed' ? 'bullish' : news.fearGreed === 'fear' ? 'bearish' : 'neutral'}>
                      {news.fearGreed === 'greed' ? '😤 Greed' : news.fearGreed === 'fear' ? '😨 Fear' : '😐 Neutral'}
                    </Badge>
                  </div>
                  <p className="text-sm font-bold text-white leading-snug">{news.marketPulse}</p>
                  {news.hotSector && (
                    <p className="text-xs text-surface-500 mt-1.5">
                      Hot sector: <span className="text-white font-semibold">{news.hotSector}</span>
                    </p>
                  )}
                </div>

                <HR />
                <SectionLabel>Current Events · {news.count || news.events?.length} stories</SectionLabel>
                {news.events?.map((e, i) => <EventCard key={i} event={e} index={i} />)}

                <button onClick={runNews}
                  className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700 text-xs font-bold text-surface-500 hover:text-white hover:border-surface-600 transition-all mt-1">
                  🔄 Refresh
                </button>
                <p className="text-[10px] text-surface-600 text-center px-4">
                  ⚠️ AI-generated. Not financial advice.
                </p>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stock detail sheet (portal-like fixed overlay) ─────────────── */}
      <AnimatePresence>
        {selectedStock && (
          <StockDetailSheet
            symbol={selectedStock}
            onClose={() => setSelectedStock(null)}
            onAnalyze={(sym) => {
              setSelectedStock(null);
              setAnalyzeInput(sym);
              setTab('analyze');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
