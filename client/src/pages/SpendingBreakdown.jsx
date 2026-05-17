import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api.js';

const CATEGORY_CONFIG = {
  FOOD_AND_DRINK:   { label: 'Food & Drink',    color: '#f97316', icon: '🍔' },
  SHOPS:            { label: 'Shopping',          color: '#8b5cf6', icon: '🛍️' },
  ENTERTAINMENT:    { label: 'Entertainment',     color: '#3b82f6', icon: '🎮' },
  TRANSPORTATION:   { label: 'Transport',         color: '#10b981', icon: '🚗' },
  HEALTH:           { label: 'Health',            color: '#ec4899', icon: '💊' },
  TRAVEL:           { label: 'Travel',            color: '#f59e0b', icon: '✈️' },
  PERSONAL_CARE:    { label: 'Personal',          color: '#06b6d4', icon: '💅' },
  OTHER:            { label: 'Other',             color: '#6b7280', icon: '📦' },
};

function getCategory(cat) {
  if (!cat) return CATEGORY_CONFIG.OTHER;
  const key = cat.toUpperCase().replace(/ /g, '_');
  return CATEGORY_CONFIG[key] || CATEGORY_CONFIG.OTHER;
}

function DonutChart({ segments, total }) {
  let offset = 0;
  const r = 54;
  const circ = 2 * Math.PI * r;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-[-90deg]">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#26262c" strokeWidth="16" />
        {segments.map((seg, i) => {
          const dash = (seg.pct / 100) * circ;
          const el = (
            <motion.circle
              key={i}
              cx="70" cy="70" r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ / 100}
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${dash} ${circ - dash}` }}
              transition={{ duration: 0.8, delay: i * 0.1 }}
            />
          );
          offset += seg.pct;
          return el;
        })}
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-black">${total.toFixed(0)}</p>
        <p className="text-xs text-surface-500">total</p>
      </div>
    </div>
  );
}

function MonthlyBars({ monthly }) {
  const max = Math.max(...monthly.map(m => m.total), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {monthly.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.07, duration: 0.5 }}
            style={{ transformOrigin: 'bottom', height: `${Math.max((m.total / max) * 80, 4)}px` }}
            className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400"
          />
          <p className="text-[9px] text-surface-500">{m.month}</p>
        </div>
      ))}
    </div>
  );
}

export default function SpendingBreakdown() {
  const [transactions, setTransactions] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [days]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await api.getCachedTransactions(days);
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Compute category totals
  const categoryTotals = {};
  transactions.forEach(t => {
    const key = t.category?.toUpperCase().replace(/ /g, '_') || 'OTHER';
    const cfg = CATEGORY_CONFIG[key] || CATEGORY_CONFIG.OTHER;
    if (!categoryTotals[key]) categoryTotals[key] = { ...cfg, total: 0, count: 0 };
    categoryTotals[key].total += Math.abs(t.amount);
    categoryTotals[key].count++;
  });

  const total = Object.values(categoryTotals).reduce((s, c) => s + c.total, 0);
  const sortedCats = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([, v]) => ({ ...v, pct: total > 0 ? (v.total / total) * 100 : 0 }));

  // Top merchants
  const merchantTotals = {};
  transactions.forEach(t => {
    const m = t.merchant || t.name || 'Unknown';
    merchantTotals[m] = (merchantTotals[m] || 0) + Math.abs(t.amount);
  });
  const topMerchants = Object.entries(merchantTotals)
    .sort(([, a], [, b]) => b - a).slice(0, 5);

  // Monthly breakdown
  const monthlyMap = {};
  transactions.forEach(t => {
    const month = t.date?.slice(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { month: new Date(t.date).toLocaleDateString('en', { month: 'short' }), total: 0 };
    monthlyMap[month].total += Math.abs(t.amount);
  });
  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-1">Spending Breakdown</h1>
        <p className="text-surface-500 text-sm mb-4">Where your money actually goes</p>
      </motion.div>

      {/* Day filter */}
      <div className="flex gap-2 mb-5">
        {[7, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${days === d ? 'bg-brand-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
            {d}d
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Donut chart */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card mb-4">
            <h2 className="font-bold text-sm mb-4">By Category</h2>
            <div className="flex items-center gap-4">
              <DonutChart segments={sortedCats} total={total} />
              <div className="flex-1 flex flex-col gap-1.5">
                {sortedCats.slice(0, 5).map(cat => (
                  <div key={cat.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                    <span className="text-xs text-surface-400 flex-1 truncate">{cat.label}</span>
                    <span className="text-xs font-semibold">${cat.total.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Category bars */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass-card mb-4">
            <h2 className="font-bold text-sm mb-3">Category Details</h2>
            <div className="flex flex-col gap-3">
              {sortedCats.map((cat, i) => (
                <motion.div key={cat.label} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs flex items-center gap-1.5">
                      <span>{cat.icon}</span> {cat.label}
                    </span>
                    <span className="text-xs font-semibold">${cat.total.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${cat.pct}%` }}
                      transition={{ duration: 0.7, delay: i * 0.05 }}
                      className="h-full rounded-full"
                      style={{ background: cat.color }} />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Monthly trend */}
          {monthly.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="glass-card mb-4">
              <h2 className="font-bold text-sm mb-4">Monthly Trend</h2>
              <MonthlyBars monthly={monthly} />
            </motion.div>
          )}

          {/* Top merchants */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="glass-card">
            <h2 className="font-bold text-sm mb-3">Top Merchants</h2>
            <div className="flex flex-col gap-2">
              {topMerchants.map(([name, amount], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-surface-700 flex items-center justify-center text-[10px] font-bold text-surface-400">
                    {i + 1}
                  </span>
                  <span className="text-sm flex-1 truncate">{name}</span>
                  <span className="text-sm font-semibold text-brand-400">${amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
