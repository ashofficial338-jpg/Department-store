/** @type {import('tailwindcss').Config} */
export default {
  // The theme is switched with <html data-theme="dark">, so `dark:` variants follow that attribute.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        graphite: {
          50: '#F6F6F7', 100: '#E9EAEC', 200: '#D2D4D9', 300: '#AEB1BA',
          400: '#838795', 500: '#5F6373', 600: '#454856', 700: '#2F323E',
          800: '#1E2028', 900: '#14151B', 950: '#0B0C10',
        },
        gold: {
          50: '#FBF7EE', 100: '#F5EAD2', 200: '#EBD8AF', 300: '#DFC08A',
          400: '#D2AA6C', 500: '#C29A56', 600: '#A67F42', 700: '#856436',
          800: '#6B5230', 900: '#59442B',
        },
        surface: {
          DEFAULT: '#FAF9F6', muted: '#F3F1EA', border: '#E7E3D8',
        },
      },
      boxShadow: {
        premium: '0 1px 2px rgba(11,12,16,0.04), 0 8px 24px -10px rgba(11,12,16,0.10)',
        'premium-lg': '0 2px 6px rgba(11,12,16,0.05), 0 24px 48px -18px rgba(11,12,16,0.22)',
        gold: '0 10px 28px -10px rgba(194,154,86,0.55)',
        'gold-glow': '0 0 0 1px rgba(210,170,108,0.35), 0 12px 32px -12px rgba(194,154,86,0.55)',
        'inner-hairline': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      borderRadius: {
        xl2: '1.25rem',
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
