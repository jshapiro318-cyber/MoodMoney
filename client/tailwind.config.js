/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        accent: {
          purple: '#a855f7',
          blue:   '#3b82f6',
          pink:   '#ec4899',
        },
        // Refined dark surfaces — blue-tinted near-black (premium fintech)
        surface: {
          950: '#06060b',
          900: '#09090f',
          800: '#111118',
          750: '#141420',
          700: '#1a1a26',
          600: 'rgba(255,255,255,0.08)',
          500: 'rgba(255,255,255,0.12)',
          400: '#50505e',
          300: '#70708a',
          200: '#9090aa',
          100: '#c0c0d4',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-up':    'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1)',
        'fade-in':    'fadeIn 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer':    'shimmer 1.6s ease-in-out infinite',
        'spin-slow':  'spin 1.4s linear infinite',
      },
      keyframes: {
        fadeUp:    { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
        shimmer:   { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
      borderRadius: {
        '4xl': '32px',
      },
      boxShadow: {
        'brand':  '0 4px 20px rgba(249,115,22,0.3)',
        'green':  '0 4px 20px rgba(52,211,153,0.2)',
        'card':   '0 2px 12px rgba(0,0,0,0.4)',
        'card-lg':'0 8px 32px rgba(0,0,0,0.5)',
        'nav':    '0 8px 32px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
      },
    },
  },
  plugins: [],
};
