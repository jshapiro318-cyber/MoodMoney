import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

// Floating chat button shown on non-chat pages so users can always access the AI
export default function FloatingChat() {
  const location = useLocation();
  const navigate = useNavigate();

  // Don't show on the chat page itself or onboarding
  if (['/chat', '/onboarding'].includes(location.pathname)) return null;

  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', bounce: 0.5, delay: 0.5 }}
      onClick={() => navigate('/chat')}
      className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-accent-purple shadow-lg shadow-brand-500/30 flex items-center justify-center text-2xl z-50 active:scale-95 transition-transform"
      aria-label="Open AI chat"
    >
      💬
    </motion.button>
  );
}
