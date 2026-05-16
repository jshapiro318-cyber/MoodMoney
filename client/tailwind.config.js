/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // MoodMoney brand palette — warm + dark, not corporate blue
        brand: {
          50:  '#fff8f0',
          100: '#ffecd6',
          200: '#ffd4a3',
          300: '#ffb566',
          400: '#ff8c24',
          500: '#f97316',  // primary orange
          600: '#ea6209',
          700: '#c24d08',
          800: '#9a3d0f',
          900: '#7c3410',
        },
        surface: {
          900: '#0d0d0f',  // deepest background
          800: '#141416',  // card background
          700: '#1c1c20',  // elevated card
          600: '#26262c',  // border/divider
          500: '#3a3a42',  // muted element
        },
        accent: {
          purple: '#a855f7',
          teal:   '#14b8a6',
          pink:   '#ec4899',
          yellow: '#eab308',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
      },
      animation: {
        'fade-up':    'fadeUp 0.5s ease-out',
        'fade-in':    'fadeIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'slide-up':   'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeUp:    { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        pulseSoft: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
        slideUp:   { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
