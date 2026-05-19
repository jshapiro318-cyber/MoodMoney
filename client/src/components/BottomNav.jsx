import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from './Icon.jsx';

const NAV_ITEMS = [
  { path: '/dashboard', icon: 'home',          label: 'Home'    },
  { path: '/spending',  icon: 'bar-chart',      label: 'Spend'   },
  { path: '/stocks',    icon: 'trending-up',    label: 'Markets' },
  { path: '/trading',   icon: 'arrows-up-down', label: 'Trade'   },
  { path: '/learn',     icon: 'academic-cap',   label: 'Learn'   },
  { path: '/social',    icon: 'trophy',         label: 'Social'  },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  if (location.pathname === '/onboarding') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-4 px-4 z-50 pointer-events-none">
      {/* Fade gradient so content doesn't overlap harshly */}
      <div className="absolute inset-x-0 bottom-full h-10 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(9,9,15,0.9) 0%, transparent 100%)' }} />

      <nav
        className="pointer-events-auto flex items-center gap-1 px-2 py-2 max-w-[380px] w-full"
        style={{
          background: 'rgba(18,18,26,0.95)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
        }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center justify-center gap-1 flex-1 py-1.5 rounded-2xl transition-all duration-200 active:scale-95"
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-2xl"
                  style={{ background: 'rgba(249,115,22,0.15)' }}
                  transition={{ type: 'spring', damping: 24, stiffness: 350 }}
                />
              )}
              <Icon
                name={item.icon}
                size={18}
                strokeWidth={active ? 2.1 : 1.6}
                className={`relative z-10 transition-all duration-200 ${
                  active ? 'text-orange-400' : 'text-zinc-500'
                }`}
              />
              <span className={`relative z-10 font-semibold leading-none transition-all duration-200 ${
                active ? 'text-orange-400' : 'text-zinc-600'
              }`} style={{ fontSize: '9px' }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
