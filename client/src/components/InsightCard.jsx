import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const SEVERITY_STYLES = {
  info:     'border-surface-600',
  warning:  'border-yellow-500/40 bg-yellow-500/5',
  critical: 'border-red-500/40 bg-red-500/5',
};

const CATEGORY_LABELS = {
  emotional:   { label: 'Emotional',  color: 'text-pink-400 bg-pink-400/10' },
  timing:      { label: 'Timing',     color: 'text-blue-400 bg-blue-400/10' },
  habit:       { label: 'Habit',      color: 'text-purple-400 bg-purple-400/10' },
  anomaly:     { label: 'Anomaly',    color: 'text-red-400 bg-red-400/10' },
  achievement: { label: '🏆 Win',     color: 'text-green-400 bg-green-400/10' },
};

export default function InsightCard({ insight, index }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const severityClass = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;
  const categoryMeta = CATEGORY_LABELS[insight.category] || CATEGORY_LABELS.habit;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 30 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => setExpanded(!expanded)}
      className={`glass-card border ${severityClass} cursor-pointer select-none`}
    >
      <div className="flex items-start gap-3">
        <motion.span
          animate={{ rotate: expanded ? [0, -10, 10, 0] : 0 }}
          transition={{ duration: 0.4 }}
          className="text-2xl flex-shrink-0 mt-0.5"
        >
          {insight.icon}
        </motion.span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-sm leading-tight">{insight.title}</h3>
            <span className={`pill text-xs ${categoryMeta.color}`}>{categoryMeta.label}</span>
          </div>

          <p className="text-surface-500 text-sm leading-relaxed">{insight.body}</p>

          {insight.amount && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-brand-400 font-bold text-sm mt-1.5"
            >
              ${insight.amount.toLocaleString()}
            </motion.p>
          )}

          <AnimatePresence>
            {expanded && insight.actionPrompt && (
              <motion.button
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onClick={e => { e.stopPropagation(); navigate('/chat', { state: { prompt: insight.actionPrompt } }); }}
                className="mt-2 text-xs text-brand-400 flex items-center gap-1 font-medium"
              >
                Ask AI about this →
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          className="text-surface-500 text-xs mt-1 flex-shrink-0"
        >
          ▾
        </motion.span>
      </div>
    </motion.div>
  );
}
