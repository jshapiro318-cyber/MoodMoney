import { motion } from 'framer-motion';

export default function ChatBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple flex items-center justify-center text-sm flex-shrink-0 mt-1">
          🤖
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-brand-500 text-white rounded-tr-sm'
            : message.isPaywall
            ? 'bg-surface-800 border border-brand-500/40 text-white rounded-tl-sm'
            : message.isError
            ? 'bg-surface-800 border border-red-500/20 text-surface-500 rounded-tl-sm'
            : 'bg-surface-800 text-white rounded-tl-sm'
        }`}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
