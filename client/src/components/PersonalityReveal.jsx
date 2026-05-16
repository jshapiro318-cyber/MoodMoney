import { motion } from 'framer-motion';

// Color theme per personality type
const PERSONALITY_THEMES = {
  'Emotional Spender':  { from: '#f97316', to: '#ec4899', bg: 'from-orange-500 to-pink-500' },
  'Chaos Buyer':        { from: '#a855f7', to: '#ec4899', bg: 'from-purple-500 to-pink-500' },
  'Safe Saver':         { from: '#14b8a6', to: '#06b6d4', bg: 'from-teal-500 to-cyan-500' },
  'Dopamine Shopper':   { from: '#f59e0b', to: '#f97316', bg: 'from-yellow-500 to-orange-500' },
  'Future Builder':     { from: '#22c55e', to: '#14b8a6', bg: 'from-green-500 to-teal-500' },
  'Status Spender':     { from: '#a855f7', to: '#6366f1', bg: 'from-purple-500 to-indigo-500' },
  'Fearful Investor':   { from: '#64748b', to: '#475569', bg: 'from-slate-500 to-slate-600' },
};

export default function PersonalityReveal({ personality, onContinue }) {
  const theme = PERSONALITY_THEMES[personality.type] || PERSONALITY_THEMES['Emotional Spender'];

  return (
    <div className="screen-card justify-between overflow-hidden">
      {/* Animated gradient background burst */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 3, opacity: 0.15 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-gradient-to-br ${theme.bg} blur-3xl pointer-events-none`}
      />

      <div className="relative flex flex-col items-center gap-6 pt-8 text-center">
        {/* Big emoji reveal */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.6, delay: 0.2 }}
          className="text-8xl"
        >
          {personality.emoji}
        </motion.div>

        {/* Type label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-surface-500 text-sm uppercase tracking-widest mb-2">Your money personality</p>
          <h1 className={`text-4xl font-black bg-gradient-to-r ${theme.bg} bg-clip-text text-transparent`}>
            {personality.type}
          </h1>
          <p className="text-surface-500 text-base mt-2 italic">"{personality.tagline}"</p>
        </motion.div>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="text-white/80 text-sm leading-relaxed px-2"
        >
          {personality.description}
        </motion.p>

        {/* Superpower + Blindspot cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="flex gap-3 w-full"
        >
          <div className="flex-1 glass-card text-left">
            <p className="text-xs text-surface-500 mb-1">⚡ Superpower</p>
            <p className="text-sm font-medium">{personality.superpower}</p>
          </div>
          <div className="flex-1 glass-card text-left">
            <p className="text-xs text-surface-500 mb-1">👁️ Blindspot</p>
            <p className="text-sm font-medium">{personality.blindspot}</p>
          </div>
        </motion.div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="glass-card w-full text-left"
        >
          <p className="text-xs text-surface-500 mb-3">3 things to try</p>
          <div className="flex flex-col gap-2">
            {personality.tips?.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-brand-500 mt-0.5">→</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4 }}
        onClick={onContinue}
        className="btn-primary relative mt-6"
      >
        See my spending insights →
      </motion.button>
    </div>
  );
}
