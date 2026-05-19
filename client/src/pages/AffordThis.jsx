import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api.js';
import AffordabilityCard from '../components/AffordabilityCard.jsx';

const SUGGESTIONS = [
  { label: 'PS5', price: '499', icon: '🎮' },
  { label: 'MacBook Air', price: '1099', icon: '💻' },
  { label: 'Concert tickets', price: '150', icon: '🎤' },
  { label: 'Nike sneakers', price: '180', icon: '👟' },
  { label: 'Weekend trip', price: '400', icon: '✈️' },
  { label: 'New iPhone', price: '999', icon: '📱' },
];

export default function AffordThis() {
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description || !price) return;
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const data = await api.affordThis(description, parseFloat(price));
      setResult(data);
      api.awardXP('afford_check').catch(() => {});
    } catch (err) {
      setError('Analysis failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen-card pb-24">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="label mb-1">AI Check</p>
        <h1 className="text-[26px] font-black tracking-tight leading-none mb-1" style={{ letterSpacing: '-0.03em' }}>Can I Afford This?</h1>
        <p className="text-sm mb-6" style={{ color: '#606078' }}>Get an honest AI take before you buy.</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-surface-500 mb-1.5 block">What is it?</label>
                <input
                  type="text"
                  placeholder="e.g. PS5, vacation to Mexico, new laptop..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3.5 text-white placeholder-surface-500 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-surface-500 mb-1.5 block">How much?</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500 font-medium">$</span>
                  <input
                    type="number" placeholder="0.00" value={price}
                    onChange={e => setPrice(e.target.value)} min="0" step="0.01"
                    className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-8 pr-4 py-3.5 text-white placeholder-surface-500 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              {/* Quick fill chips */}
              <div>
                <p className="text-xs text-surface-500 mb-2">Quick fill</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map(s => (
                    <motion.button key={s.label} type="button" whileTap={{ scale: 0.95 }}
                      onClick={() => { setDescription(s.label); setPrice(s.price); }}
                      className="pill bg-surface-700 text-white text-xs border border-surface-600 active:border-brand-500 transition-colors">
                      {s.icon} {s.label} — ${s.price}
                    </motion.button>
                  ))}
                </div>
              </div>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-red-400 text-sm text-center">{error}</motion.p>
              )}

              <motion.button type="submit" whileTap={{ scale: 0.98 }}
                className="btn-primary mt-2" disabled={loading || !description || !price}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </span>
                ) : 'Analyze this purchase →'}
              </motion.button>
            </form>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <AffordabilityCard result={result} />
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setResult(null)}
              className="btn-ghost mt-4">
              ← Check another purchase
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
