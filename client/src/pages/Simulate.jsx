import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';

const PRESET_SCENARIOS = [
  "What if I cut food delivery by 50%?",
  "What if I invested $100 every week?",
  "When will I be debt free at my current rate?",
  "What if I cancelled all my subscriptions?",
  "What if I saved 20% of my income?",
];

const DIFFICULTY_CONFIG = {
  easy:   { color: 'text-green-400', label: 'Easy to start' },
  medium: { color: 'text-yellow-400', label: 'Takes some effort' },
  hard:   { color: 'text-red-400',   label: 'Big lifestyle change' },
};

export default function Simulate() {
  const [scenario, setScenario] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!scenario.trim()) return;
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const data = await api.simulate(scenario);
      setResult(data);
      api.awardXP('simulation_run').catch(() => {});
    } catch (err) {
      setError('Simulation failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const diffConfig = result ? DIFFICULTY_CONFIG[result.difficulty] : null;
  const maxValue = result ? Math.max(...result.timeline.map(t => t.value)) : 0;

  return (
    <div className="screen-card pb-24">
      <p className="label mb-1">Simulator</p>
      <h1 className="text-[26px] font-black tracking-tight leading-none mb-1" style={{ letterSpacing: '-0.03em' }}>What If…</h1>
      <p className="text-sm mb-6" style={{ color: '#606078' }}>Simulate any money scenario and see your future.</p>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <textarea
                placeholder="What if I stopped buying coffee every day?"
                value={scenario}
                onChange={e => setScenario(e.target.value)}
                rows={3}
                className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3.5 text-white placeholder-surface-500 outline-none focus:border-brand-500 transition-colors resize-none"
              />

              {/* Preset scenarios */}
              <div>
                <p className="text-xs text-surface-500 mb-2">Try a preset</p>
                <div className="flex flex-col gap-2">
                  {PRESET_SCENARIOS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScenario(s)}
                      className="text-left text-sm glass-card py-3 text-brand-400 active:border-brand-500 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button type="submit" className="btn-primary" disabled={loading || !scenario.trim()}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Running simulation...
                  </span>
                ) : 'Run simulation →'}
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            {/* Header */}
            <div className="glass-card">
              <p className="text-xs text-surface-500 mb-1">Scenario</p>
              <p className="font-bold text-sm">{result.scenarioTitle}</p>
              {diffConfig && (
                <span className={`text-xs mt-1 ${diffConfig.color}`}>{diffConfig.label}</span>
              )}
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Monthly', value: `$${result.monthlySavings?.toLocaleString()}` },
                { label: 'Yearly',  value: `$${result.yearlySavings?.toLocaleString()}` },
                { label: '5 Years', value: `$${result.fiveYearProjection?.toLocaleString()}` },
              ].map(stat => (
                <motion.div
                  key={stat.label}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="glass-card text-center"
                >
                  <p className="text-xs text-surface-500 mb-1">{stat.label}</p>
                  <p className="font-black text-gradient text-sm">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Timeline visualization */}
            {result.timeline?.length > 0 && (
              <div className="glass-card">
                <p className="text-xs text-surface-500 mb-4">Savings over time</p>
                <div className="flex items-end gap-2" style={{ height: '112px' }}>
                  {result.timeline.map((point, i) => {
                    const heightPx = maxValue > 0 ? Math.max((point.value / maxValue) * 100, 4) : 4;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ position: 'relative', width: '100%', height: `${heightPx}px` }}>
                          <motion.div
                            initial={{ scaleY: 0, originY: 1 }}
                            animate={{ scaleY: 1 }}
                            transition={{ delay: i * 0.1, duration: 0.6 }}
                            style={{ transformOrigin: 'bottom', height: '100%' }}
                            className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400"
                          >
                            {point.milestone && (
                              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs">🏆</span>
                            )}
                          </motion.div>
                        </div>
                        <p className="text-[10px] text-surface-500 text-center leading-tight">{point.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Goal impact + first step */}
            <div className="glass-card">
              <p className="text-xs text-surface-500 mb-1">📍 Goal impact</p>
              <p className="text-sm">{result.goalImpact}</p>
            </div>

            <div className="glass-card border border-brand-500/30 bg-brand-500/5">
              <p className="text-xs text-brand-400 mb-1">✅ First step today</p>
              <p className="text-sm font-medium">{result.firstStep}</p>
            </div>

            <p className="text-center text-surface-500 text-sm italic">"{result.motivationalLine}"</p>

            <button onClick={() => setResult(null)} className="btn-ghost">
              Try another scenario
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
