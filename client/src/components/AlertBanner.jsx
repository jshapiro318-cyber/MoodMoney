import { motion } from 'framer-motion';
import { useState } from 'react';

const URGENCY_STYLES = {
  low:    'border-surface-600 bg-surface-800',
  medium: 'border-yellow-500/40 bg-yellow-500/5',
  high:   'border-red-500/40 bg-red-500/5',
};

export default function AlertBanner({ alert }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`glass-card border mb-3 ${URGENCY_STYLES[alert.urgency] || URGENCY_STYLES.low}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-lg flex-shrink-0">{alert.icon}</span>
          <div>
            <p className="text-sm font-medium">{alert.message}</p>
            <p className="text-xs text-surface-500 mt-0.5">{alert.detail}</p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-surface-500 text-lg leading-none flex-shrink-0 mt-0.5"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
