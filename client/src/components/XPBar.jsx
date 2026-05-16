import { motion } from 'framer-motion';
import { useGamification } from '../lib/hooks.js';

export default function XPBar() {
  const { status } = useGamification();

  if (!status) return null;

  const level = status.level;
  const progress = level.maxXP === Infinity
    ? 100
    : ((status.xp - level.minXP) / (level.maxXP - level.minXP)) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card mb-4 flex items-center gap-3"
    >
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-brand-400">Lv.{level.level}</span>
            <span className="text-xs text-white">{level.name}</span>
          </div>
          <span className="text-xs text-surface-500">{status.xp} XP</span>
        </div>
        <div className="w-full bg-surface-600 rounded-full h-1.5">
          <motion.div
            className="bg-gradient-to-r from-brand-500 to-accent-purple h-1.5 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.8, delay: 0.3 }}
          />
        </div>
      </div>

      {status.current_streak > 0 && (
        <div className="flex flex-col items-center flex-shrink-0">
          <span className="text-lg">🔥</span>
          <span className="text-xs font-bold text-brand-400">{status.current_streak}</span>
        </div>
      )}
    </motion.div>
  );
}
