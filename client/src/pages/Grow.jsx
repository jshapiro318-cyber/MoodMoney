import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

const GOAL_EMOJIS = ['🏖️', '🚗', '🏠', '📱', '✈️', '🎓', '💍', '🎮', '👟', '💰'];
const GOAL_COLORS = ['#f97316', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899', '#f59e0b'];

function compound(monthly, years, rate = 0.07) {
  const months = years * 12;
  const r = rate / 12;
  return monthly * ((Math.pow(1 + r, months) - 1) / r);
}

export default function Grow() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeposit, setShowDeposit] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [investMonthly, setInvestMonthly] = useState(200);
  const [investYears, setInvestYears] = useState(5);

  // Create form state
  const [newGoal, setNewGoal] = useState({ name: '', target_amount: '', emoji: '🎯', color: '#f97316', deadline: '' });
  const [depositAmount, setDepositAmount] = useState('');

  useEffect(() => { loadGoals(); }, []);

  async function loadGoals() {
    setLoading(true);
    try {
      const data = await api.getGoals();
      setGoals(data.goals || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createGoal() {
    if (!newGoal.name || !newGoal.target_amount) return;
    try {
      await api.createGoal(newGoal);
      setShowCreate(false);
      setNewGoal({ name: '', target_amount: '', emoji: '🎯', color: '#f97316', deadline: '' });
      loadGoals();
    } catch (err) {
      console.error(err);
    }
  }

  async function deposit(goalId) {
    if (!depositAmount) return;
    const goal = goals.find(g => g.id === goalId);
    const newAmount = (goal.current_amount || 0) + parseFloat(depositAmount);
    try {
      await api.updateGoal(goalId, { current_amount: newAmount });
      setShowDeposit(null);
      setDepositAmount('');
      loadGoals();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteGoal(id) {
    try {
      await api.deleteGoal(id);
      loadGoals();
    } catch (err) {
      console.error(err);
    }
  }

  async function getAIRecommendation() {
    setLoadingRec(true);
    try {
      const txData = await api.getCachedTransactions(30);
      const data = await api.getSavingsRecommendation(txData.transactions || [], goals);
      setRecommendation(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRec(false);
    }
  }

  const projected = compound(investMonthly, investYears);

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="label mb-1">Finance</p>
        <h1 className="text-[26px] font-black tracking-tight leading-none mb-1" style={{ letterSpacing: '-0.03em' }}>Grow My Money</h1>
        <p className="text-sm mb-5" style={{ color: '#606078' }}>Save with purpose. Invest for your future.</p>
      </motion.div>

      {/* Savings Goals */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-base">My Goals</h2>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowCreate(true)}
          className="pill bg-brand-500 text-white text-xs">+ New Goal</motion.button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 mb-5">
          {[1, 2].map(i => <div key={i} className="glass-card h-20 bg-surface-700 animate-pulse" />)}
        </div>
      ) : goals.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="glass-card text-center py-10 mb-5">
          <p className="text-4xl mb-2">🎯</p>
          <p className="text-surface-500 text-sm">No goals yet. Create your first one!</p>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3 mb-5">
          {goals.map((goal, i) => {
            const pct = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
            const remaining = goal.target_amount - goal.current_amount;
            return (
              <motion.div key={goal.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }} className="glass-card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{goal.emoji}</span>
                    <div>
                      <p className="font-semibold text-sm">{goal.name}</p>
                      <p className="text-xs text-surface-500">
                        ${goal.current_amount?.toFixed(0) || 0} / ${goal.target_amount?.toFixed(0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowDeposit(goal.id); setDepositAmount(''); }}
                      className="text-xs text-brand-400 font-medium">+ Add</button>
                    <button onClick={() => deleteGoal(goal.id)}
                      className="text-xs text-surface-500">✕</button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-surface-700 rounded-full overflow-hidden mb-1">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8 }} className="h-full rounded-full"
                    style={{ background: goal.color }} />
                </div>
                <div className="flex justify-between text-xs text-surface-500">
                  <span>{pct.toFixed(0)}% saved</span>
                  <span>${remaining.toFixed(0)} to go</span>
                </div>

                {pct >= 100 && (
                  <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="text-center text-sm font-bold text-green-400 mt-2">Goal reached!</motion.p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* AI Recommendation */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="glass-card mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🤖</span>
          <h2 className="font-bold text-sm">AI Savings Coach</h2>
        </div>
        {recommendation ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-surface-400 text-xs">Recommended monthly savings</p>
              <p className="text-2xl font-black text-brand-400">${recommendation.totalRecommendedSavings}</p>
            </div>
            <p className="text-sm text-surface-300 mb-3">{recommendation.message}</p>
            {recommendation.quickWins?.length > 0 && (
              <div>
                <p className="text-xs text-surface-500 mb-1.5">Quick wins:</p>
                {recommendation.quickWins.map((w, i) => (
                  <p key={i} className="text-xs text-surface-400 flex items-start gap-1.5 mb-1">
                    <span className="text-green-400 mt-0.5">↓</span>{w}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={getAIRecommendation} disabled={loadingRec}
            className="btn-primary text-sm py-2.5 w-full">
            {loadingRec ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing your spending...
              </span>
            ) : 'Get AI savings plan →'}
          </button>
        )}
      </motion.div>

      {/* Investment Calculator */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="glass-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">📈</span>
          <h2 className="font-bold text-sm">Investment Calculator</h2>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-surface-500">Monthly investment</label>
              <span className="text-xs font-bold text-brand-400">${investMonthly}</span>
            </div>
            <input type="range" min="50" max="2000" step="50" value={investMonthly}
              onChange={e => setInvestMonthly(Number(e.target.value))}
              className="w-full accent-orange-500" />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-surface-500">For how many years</label>
              <span className="text-xs font-bold text-brand-400">{investYears} yrs</span>
            </div>
            <input type="range" min="1" max="30" step="1" value={investYears}
              onChange={e => setInvestYears(Number(e.target.value))}
              className="w-full accent-orange-500" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-brand-500/20 to-accent-purple/20 rounded-xl p-4 text-center">
          <p className="text-xs text-surface-400 mb-1">At 7% avg annual return you'd have</p>
          <motion.p key={projected} initial={{ scale: 0.9 }} animate={{ scale: 1 }}
            className="text-3xl font-black text-gradient">
            ${projected.toLocaleString('en', { maximumFractionDigits: 0 })}
          </motion.p>
          <p className="text-xs text-surface-500 mt-1">
            ${(investMonthly * investYears * 12).toLocaleString()} invested · ${(projected - investMonthly * investYears * 12).toLocaleString('en', { maximumFractionDigits: 0 })} from growth
          </p>
        </div>
      </motion.div>

      {/* Create goal modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-end justify-center z-50"
            onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-surface-800 rounded-t-3xl p-6 w-full max-w-md">
              <h3 className="font-bold text-lg mb-4">New Savings Goal</h3>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2 flex-wrap">
                  {GOAL_EMOJIS.map(e => (
                    <button key={e} onClick={() => setNewGoal(g => ({ ...g, emoji: e }))}
                      className={`text-xl p-1.5 rounded-lg transition-colors ${newGoal.emoji === e ? 'bg-brand-500/30' : 'bg-surface-700'}`}>
                      {e}
                    </button>
                  ))}
                </div>

                <input type="text" placeholder="Goal name (e.g. Summer vacation)"
                  value={newGoal.name} onChange={e => setNewGoal(g => ({ ...g, name: e.target.value }))}
                  className="w-full bg-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 outline-none focus:ring-1 focus:ring-brand-500" />

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">$</span>
                  <input type="number" placeholder="Target amount"
                    value={newGoal.target_amount} onChange={e => setNewGoal(g => ({ ...g, target_amount: e.target.value }))}
                    className="w-full bg-surface-700 rounded-xl pl-8 pr-4 py-3 text-white placeholder-surface-500 outline-none focus:ring-1 focus:ring-brand-500" />
                </div>

                <div className="flex gap-2">
                  {GOAL_COLORS.map(c => (
                    <button key={c} onClick={() => setNewGoal(g => ({ ...g, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${newGoal.color === c ? 'scale-125 ring-2 ring-white/50' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>

                <input type="date" value={newGoal.deadline}
                  onChange={e => setNewGoal(g => ({ ...g, deadline: e.target.value }))}
                  className="w-full bg-surface-700 rounded-xl px-4 py-3 text-surface-400 outline-none focus:ring-1 focus:ring-brand-500" />
              </div>

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={createGoal} disabled={!newGoal.name || !newGoal.target_amount}
                  className="btn-primary flex-1">Create Goal</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDeposit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-end justify-center z-50"
            onClick={e => e.target === e.currentTarget && setShowDeposit(null)}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="bg-surface-800 rounded-t-3xl p-6 w-full max-w-md">
              <h3 className="font-bold text-lg mb-4">Add Money</h3>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 text-xl">$</span>
                <input type="number" placeholder="0.00" value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  className="w-full bg-surface-700 rounded-xl pl-10 pr-4 py-4 text-white text-xl placeholder-surface-500 outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeposit(null)} className="btn-ghost flex-1">Cancel</button>
                <button onClick={() => deposit(showDeposit)} disabled={!depositAmount}
                  className="btn-primary flex-1">Add ${depositAmount || 0}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
