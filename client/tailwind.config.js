/** @type {import('tailwindcss').Config} */
export default {
  // The theme is switched with <html data-theme="dark">, so `dark:` variants follow that attribute.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Design system (Nov 2026): Inter type, slate neutrals, indigo brand.
      // The `gold` and `graphite` names are kept so every existing class (bg-gold-50, text-graphite-500...)
      // picks up the new palette without touching page code: gold = indigo brand scale, graphite = slate.
      fontFamily: {
        display: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        graphite: {
          50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1',
          400: '#94A3B8', 500: '#64748B', 600: '#475569', 700: '#334155',
          800: '#1E293B', 900: '#0F172A', 950: '#020617',
        },
        gold: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
          400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA',
          800: '#3730A3', 900: '#312E81',
        },
        brand: {
          50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
          400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA',
          800: '#3730A3', 900: '#312E81',
        },
        surface: {
          DEFAULT: '#F8FAFC', muted: '#F1F5F9', border: '#E2E8F0',
        },
      },
      boxShadow: {
        premium: '0 1px 2px rgba(15,23,42,0.05), 0 4px 12px -4px rgba(15,23,42,0.06)',
        'premium-lg': '0 4px 8px -2px rgba(15,23,42,0.06), 0 20px 40px -12px rgba(15,23,42,0.18)',
        gold: '0 6px 16px -6px rgba(79,70,229,0.45)',
        'gold-glow': '0 0 0 1px rgba(99,102,241,0.30), 0 10px 24px -10px rgba(79,70,229,0.50)',
        'inner-hairline': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      transitionTimingFunction: {
        luxe: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        sheen: { '0%': { transform: 'translateX(-120%) skewX(-20deg)' }, '100%': { transform: 'translateX(220%) skewX(-20deg)' } },
        'gradient-pan': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        aurora: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%,-4%,0) scale(1.08)' },
          '66%': { transform: 'translate3d(-5%,5%,0) scale(0.96)' },
        },
        'pulse-ring': { '0%': { transform: 'scale(0.8)', opacity: 0.7 }, '100%': { transform: 'scale(2.2)', opacity: 0 } },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        sheen: 'sheen 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
        'gradient-pan': 'gradient-pan 8s ease infinite',
        aurora: 'aurora 18s ease-in-out infinite',
        'aurora-slow': 'aurora 26s ease-in-out infinite reverse',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
    },
  },
  plugins: [],
};
