import { motion } from 'framer-motion';
import { useState } from 'react';

const VERDICT_CONFIG = {
  green:  { bg: 'bg-green-500/10',  border: 'border-green-500/40',  ring: '#22c55e', label: 'text-green-400',  emoji: '✅' },
  yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/40', ring: '#eab308', label: 'text-yellow-400', emoji: '⚠️' },
  red:    { bg: 'bg-red-500/10',    border: 'border-red-500/40',    ring: '#ef4444', label: 'text-red-400',    emoji: '🚨' },
};

export default function AffordabilityCard({ result }) {
  const config = VERDICT_CONFIG[result.verdict] || VERDICT_CONFIG.yellow;
  const score = result.budgetScore || 0;
  const [copied, setCopied] = useState(false);

  function copyCaption() {
    navigator.clipboard?.writeText(result.shareCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Main verdict card */}
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`glass-card border ${config.border} ${config.bg}`}
      >
        <div className="flex items-center gap-4 mb-4">
          {/* Animated score ring */}
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-full h-full">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#26262c" strokeWidth="3" />
              <motion.circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={config.ring} strokeWidth="3" strokeLinecap="round"
                initial={{ strokeDasharray: '0 100' }}
                animate={{ strokeDasharray: `${score} 100` }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black">{score}</span>
              <span className="text-[9px] text-surface-500">score</span>
            </div>
          </div>

          <div className="flex-1">
            <motion.p
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className={`text-xl font-black ${config.label}`}
            >
              {config.emoji} {result.verdictLabel}
            </motion.p>
            <p className="text-white text-sm mt-1 font-medium leading-tight">{result.headline}</p>
            <p className="text-surface-500 text-xs mt-1">{result.item} — ${Number(result.price).toLocaleString()}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-surface-900/60 rounded-xl p-3"
          >
            <p className="text-xs text-surface-500 mb-1">⏳ Goal delay</p>
            <p className="font-bold text-sm">{result.goalDelay?.days} days</p>
            <p className="text-xs text-surface-500">{result.goalDelay?.goalName}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="bg-surface-900/60 rounded-xl p-3"
          >
            <p className="text-xs text-surface-500 mb-1">📈 5-yr opportunity</p>
            <p className="font-bold text-sm">${result.opportunityCost5yr?.toLocaleString()}</p>
            <p className="text-xs text-surface-500">if invested @ 7%</p>
          </motion.div>
        </div>

        {/* Psychology note */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="mt-3 pt-3 border-t border-surface-600"
        >
          <p className="text-xs text-surface-500 mb-1">🧠 The psychology</p>
          <p className="text-sm text-white/80 leading-relaxed">{result.emotionalNote}</p>
        </motion.div>
      </motion.div>

      {/* Alternatives */}
      {result.alternatives?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="glass-card"
        >
          <p className="text-xs text-surface-500 mb-3">💡 Cheaper alternatives</p>
          <div className="flex flex-col gap-2">
            {result.alternatives.map((alt, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="flex items-center justify-between py-1"
              >
                <span className="text-sm">{alt.name}</span>
                <div className="text-right">
                  <span className="text-sm font-bold">${alt.price}</span>
                  <span className="text-green-400 text-xs ml-2">save ${alt.savings}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Share card */}
      {result.shareCaption && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="glass-card"
        >
          <p className="text-xs text-surface-500 mb-2">📱 Share this result</p>
          <p className="text-sm text-white/80 italic leading-relaxed">"{result.shareCaption}"</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={copyCaption}
            className="mt-3 text-xs font-medium px-3 py-1.5 rounded-lg bg-surface-700 text-brand-400"
          >
            {copied ? '✓ Copied!' : 'Copy caption'}
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
