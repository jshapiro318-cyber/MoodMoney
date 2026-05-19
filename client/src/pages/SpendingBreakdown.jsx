import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG = {
  FOOD_AND_DRINK:      { label: 'Food & Drink',  color: '#f97316' },
  SHOPS:               { label: 'Shopping',       color: '#8b5cf6' },
  ENTERTAINMENT:       { label: 'Entertainment',  color: '#3b82f6' },
  TRANSPORTATION:      { label: 'Transport',      color: '#10b981' },
  HEALTH:              { label: 'Health',         color: '#ec4899' },
  TRAVEL:              { label: 'Travel',         color: '#f59e0b' },
  PERSONAL_CARE:       { label: 'Personal Care',  color: '#06b6d4' },
  RENT_AND_UTILITIES:  { label: 'Rent & Bills',   color: '#34d399' },
  GENERAL_SERVICES:    { label: 'Services',       color: '#a78bfa' },
  OTHER:               { label: 'Other',          color: '#6b7280' },
};

function getCat(cat) {
  if (!cat) return CATEGORY_CONFIG.OTHER;
  return CATEGORY_CONFIG[cat.toUpperCase().replace(/ /g, '_')] || CATEGORY_CONFIG.OTHER;
}

// ─── Effectiveness helpers ────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 70) return '#34d399'; // green
  if (s >= 45) return '#fbbf24'; // amber
  return '#f87171';              // red
}
function scoreLabel(s) {
  if (s >= 80) return 'Essential';
  if (s >= 65) return 'Smart';
  if (s >= 50) return 'Moderate';
  if (s >= 35) return 'Questionable';
  return 'Impulsive';
}

// ─── Donut chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments, total }) {
  let offset = 0;
  const r = 54, circ = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center flex-shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-[-90deg]">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1a1a26" strokeWidth="16" />
        {segments.map((seg, i) => {
          const dash = (seg.pct / 100) * circ;
          const el = (
            <motion.circle key={i} cx="70" cy="70" r={r} fill="none"
              stroke={seg.color} strokeWidth="16"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ / 100}
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${dash} ${circ - dash}` }}
              transition={{ duration: 0.8, delay: i * 0.1 }} />
          );
          offset += seg.pct;
          return el;
        })}
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-black nums">${total.toFixed(0)}</p>
        <p className="text-[10px] font-medium" style={{ color: '#606078' }}>total</p>
      </div>
    </div>
  );
}

// ─── Score ring (small) ───────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const color = scoreColor(score);
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a1a26" strokeWidth="3" />
        <motion.circle cx="18" cy="18" r="15.9" fill="none"
          stroke={color} strokeWidth="3" strokeLinecap="round"
          initial={{ strokeDasharray: '0 100' }}
          animate={{ strokeDasharray: `${score} 100` }}
          transition={{ duration: 0.8, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-black nums" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────
function TxnRow({ txn, index }) {
  const [open, setOpen] = useState(false);
  const cat   = getCat(txn.category);
  const score = txn.effectivenessScore ?? 50;
  const color = scoreColor(score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4) }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors active:bg-white/5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Category dot */}
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />

        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{txn.name}</p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: '#606078' }}>
            {cat.label} · {txn.date}
          </p>
        </div>

        {/* Score ring */}
        <ScoreRing score={score} />

        {/* Amount */}
        <div className="text-right flex-shrink-0 w-[60px]">
          <p className="text-sm font-black nums">${txn.amount?.toFixed(2)}</p>
          <p className="text-[9px] font-bold" style={{ color }}>
            {scoreLabel(score)}
          </p>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden">
            <div className="px-4 py-3 flex flex-col gap-2.5"
              style={{ background: '#111118', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

              {/* Effectiveness bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#606078' }}>
                    Effectiveness
                  </span>
                  <span className="text-[10px] font-black nums" style={{ color }}>{score}/100</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1a26' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: color }} />
                </div>
              </div>

              {/* Stats row */}
              <div className="flex gap-3">
                {txn.merchant && txn.merchant !== txn.name && (
                  <div style={{ background: '#1a1a26', borderRadius: 8, padding: '6px 10px' }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#606078' }}>Merchant</p>
                    <p className="text-xs font-semibold text-white">{txn.merchant}</p>
                  </div>
                )}
                {txn.channel && (
                  <div style={{ background: '#1a1a26', borderRadius: 8, padding: '6px 10px' }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#606078' }}>Channel</p>
                    <p className="text-xs font-semibold text-white capitalize">{txn.channel}</p>
                  </div>
                )}
                {txn.subcategory && (
                  <div style={{ background: '#1a1a26', borderRadius: 8, padding: '6px 10px' }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#606078' }}>Type</p>
                    <p className="text-xs font-semibold text-white">{txn.subcategory}</p>
                  </div>
                )}
              </div>

              {/* Interpretation */}
              <p className="text-xs leading-relaxed" style={{ color: '#70708a' }}>
                {score >= 80 && 'This is a necessary or high-value purchase — well spent.'}
                {score >= 65 && score < 80 && 'A reasonable purchase. Could be intentional or habitual.'}
                {score >= 50 && score < 65 && 'Moderate — worth considering if this was truly needed.'}
                {score >= 35 && score < 50 && 'This looks like discretionary spending. Was it planned?'}
                {score < 35 && 'Pattern suggests this may be an emotional or impulse purchase.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Monthly bars ─────────────────────────────────────────────────────────────
function MonthlyBars({ monthly }) {
  const max = Math.max(...monthly.map(m => m.total), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {monthly.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <motion.div
            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.07, duration: 0.5 }}
            style={{ transformOrigin: 'bottom', height: `${Math.max((m.total / max) * 80, 4)}px`,
              background: 'linear-gradient(to top, #ea580c, #fb923c)', borderRadius: '3px 3px 0 0' }} />
          <p className="text-[9px]" style={{ color: '#606078' }}>{m.month}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SpendingBreakdown() {
  const [transactions, setTransactions] = useState([]);
  const [emotionalScore, setEmotionalScore] = useState(null);
  const [days, setDays]     = useState(30);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'purchases'
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'amount' | 'score'

  useEffect(() => { loadData(); }, [days]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await api.getRatedTransactions(days);
      setTransactions(data.transactions || []);
      if (data.emotionalScore != null) setEmotionalScore(data.emotionalScore);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Category aggregates
  const catMap = {};
  transactions.forEach(t => {
    if (t.amount <= 0) return;
    const key = (t.category || 'OTHER').toUpperCase().replace(/ /g, '_');
    const cfg = CATEGORY_CONFIG[key] || CATEGORY_CONFIG.OTHER;
    if (!catMap[key]) catMap[key] = { ...cfg, total: 0, count: 0 };
    catMap[key].total += t.amount;
    catMap[key].count++;
  });
  const total      = Object.values(catMap).reduce((s, c) => s + c.total, 0);
  const sortedCats = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, pct: total > 0 ? (c.total / total) * 100 : 0 }));

  // Monthly breakdown
  const monthMap = {};
  transactions.forEach(t => {
    const m = t.date?.slice(0, 7);
    if (!monthMap[m]) monthMap[m] = {
      month: new Date(t.date + 'T12:00:00').toLocaleDateString('en', { month: 'short' }),
      total: 0,
    };
    monthMap[m].total += Math.abs(t.amount);
  });
  const monthly = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  // Sorted purchases (spending only, positive amounts)
  const purchases = transactions.filter(t => t.amount > 0);
  const sorted = [...purchases].sort((a, b) => {
    if (sortBy === 'amount') return b.amount - a.amount;
    if (sortBy === 'score')  return a.effectivenessScore - b.effectivenessScore; // lowest first
    return new Date(b.date) - new Date(a.date);
  });

  // Average effectiveness
  const avgScore = purchases.length
    ? Math.round(purchases.reduce((s, t) => s + (t.effectivenessScore ?? 50), 0) / purchases.length)
    : null;

  return (
    <div className="screen-card pb-28">

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <p className="label mb-1">Analytics</p>
        <h1 className="text-[26px] font-black tracking-tight leading-none" style={{ letterSpacing: '-0.03em' }}>Spending</h1>
        <p className="text-sm mt-1" style={{ color: '#606078' }}>Where your money actually goes</p>
      </motion.div>

      {/* ── Day filter ─────────────────────────────────────── */}
      <div className="flex gap-2 mb-5">
        {[7, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={days === d
              ? { background: '#f97316', color: '#fff' }
              : { background: '#1a1a26', color: '#606078', border: '1px solid rgba(255,255,255,0.08)' }}>
            {d}d
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <>
          {/* ── Score summary row ──────────────────────────── */}
          {(emotionalScore != null || avgScore != null) && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 gap-2.5 mb-5">
              {emotionalScore != null && (
                <div className="glass-card flex items-center gap-3">
                  <div>
                    <p className="label mb-1">Emotional Score</p>
                    <p className="text-3xl font-black nums text-gradient">{emotionalScore}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#606078' }}>
                      {emotionalScore > 70 ? 'Emotion-driven' : emotionalScore > 40 ? 'Mixed' : 'Intentional'}
                    </p>
                  </div>
                </div>
              )}
              {avgScore != null && (
                <div className="glass-card flex items-center gap-3">
                  <div>
                    <p className="label mb-1">Avg Effectiveness</p>
                    <p className="text-3xl font-black nums" style={{ color: scoreColor(avgScore) }}>{avgScore}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#606078' }}>{scoreLabel(avgScore)}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Tab bar ────────────────────────────────────── */}
          <div className="flex gap-1.5 mb-4">
            {[['overview','Overview'],['purchases','Purchases']].map(([id, lbl]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                style={activeTab === id
                  ? { background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.2)' }
                  : { background: '#1a1a26', color: '#606078', border: '1px solid rgba(255,255,255,0.07)' }}>
                {lbl}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ══ OVERVIEW ══ */}
            {activeTab === 'overview' && (
              <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* Donut */}
                <div className="glass-card mb-4">
                  <p className="label mb-3">By Category</p>
                  <div className="flex items-center gap-4">
                    <DonutChart segments={sortedCats} total={total} />
                    <div className="flex-1 flex flex-col gap-1.5">
                      {sortedCats.slice(0, 5).map(cat => (
                        <div key={cat.label} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                          <span className="text-xs flex-1 truncate" style={{ color: '#9090aa' }}>{cat.label}</span>
                          <span className="text-xs font-bold nums">${cat.total.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Category bars */}
                <div className="glass-card mb-4">
                  <p className="label mb-3">Category Breakdown</p>
                  <div className="flex flex-col gap-3">
                    {sortedCats.map((cat, i) => (
                      <motion.div key={cat.label} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium" style={{ color: '#c0c0d4' }}>{cat.label}</span>
                          <span className="text-xs font-bold nums">${cat.total.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1a26' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${cat.pct}%` }}
                            transition={{ duration: 0.7, delay: i * 0.04 }}
                            className="h-full rounded-full" style={{ background: cat.color }} />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Monthly trend */}
                {monthly.length > 1 && (
                  <div className="glass-card">
                    <p className="label mb-3">Monthly Trend</p>
                    <MonthlyBars monthly={monthly} />
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ PURCHASES ══ */}
            {activeTab === 'purchases' && (
              <motion.div key="pu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                {/* Sort controls */}
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-medium flex-shrink-0" style={{ color: '#606078' }}>Sort:</p>
                  {[['date','Date'],['amount','Amount'],['score','Score ↑']].map(([id, lbl]) => (
                    <button key={id} onClick={() => setSortBy(id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={sortBy === id
                        ? { background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.2)' }
                        : { background: '#1a1a26', color: '#606078', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 mb-3 px-1">
                  {[['#34d399','70+','Intentional'],['#fbbf24','45-69','Moderate'],['#f87171','<45','Impulsive']].map(([color, range, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[9px] font-medium" style={{ color: '#606078' }}>{label}</span>
                    </div>
                  ))}
                </div>

                {/* Transaction list */}
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'linear-gradient(145deg, #161620 0%, #111118 100%)' }}>
                  {sorted.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-center gap-2">
                      <Icon name="chart-line" size={24} style={{ color: '#50505e' }} />
                      <p className="text-sm font-semibold text-white">No purchases in this period</p>
                    </div>
                  ) : (
                    sorted.map((txn, i) => <TxnRow key={txn.id} txn={txn} index={i} />)
                  )}
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
