import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { path: '/dashboard', icon: '🏠', label: 'Home'    },
  { path: '/spending',  icon: '📊', label: 'Spending'},
  { path: '/stocks',    icon: '📈', label: 'Stocks'  },
  { path: '/trading',   icon: '💹', label: 'Trade'   },
  { path: '/learn',     icon: '📚', label: 'Learn'   },
  { path: '/chat',      icon: '💬', label: 'Chat'    },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === '/onboarding') return null;

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface-800/95 backdrop-blur-md border-t border-surface-600 px-1 pb-safe">
      <div className="flex items-center justify-around py-1.5">
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors relative flex-1"
            >
              {active && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 bg-brand-500/15 rounded-xl"
                />
              )}
              <span className={`text-[18px] leading-none relative ${active ? '' : 'opacity-50'}`}>{item.icon}</span>
              <span className={`text-[9px] font-semibold relative leading-none ${active ? 'text-brand-400' : 'text-surface-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
