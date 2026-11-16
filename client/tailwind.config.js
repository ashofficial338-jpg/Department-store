// Brand accent: indigo-violet. `gold` is kept as an alias of `brand` so the many existing
// `gold-*` utilities across the pages pick up the new accent without touching every file.
const brand = {
  50: '#F1F2FF', 100: '#E4E6FF', 200: '#CDD0FF', 300: '#A9ADFF',
  400: '#8283FB', 500: '#6558F5', 600: '#5341E8', 700: '#4532CC',
  800: '#392BA5', 900: '#312A82', 950: '#1E184D',
};

/** @type {import('tailwindcss').Config} */
export default {
  // The theme is switched with <html data-theme="dark">, so `dark:` variants follow that attribute.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        brand,
        gold: brand,
        // Cool slate neutrals.
        graphite: {
          50: '#F7F8FC', 100: '#EEF0F7', 200: '#DFE2EE', 300: '#C3C8DA',
          400: '#959BB5', 500: '#6B7190', 600: '#4A5068', 700: '#333850',
          800: '#1F2337', 900: '#131627', 950: '#0A0C18',
        },
        accent: { 300: '#67E8F9', 400: '#22D3EE', 500: '#06B6D4', 600: '#0891B2' },
        surface: {
          DEFAULT: '#FFFFFF', muted: '#F7F8FC', border: '#E6E8F1',
        },
      },
      boxShadow: {
        premium: '0 1px 2px rgba(15,18,34,0.04), 0 8px 24px -12px rgba(15,18,34,0.10)',
        'premium-lg': '0 2px 6px rgba(15,18,34,0.05), 0 28px 56px -22px rgba(15,18,34,0.28)',
        brand: '0 10px 26px -10px rgba(101,88,245,0.60)',
        'brand-glow': '0 0 0 1px rgba(130,131,251,0.40), 0 14px 34px -12px rgba(101,88,245,0.65)',
        gold: '0 10px 26px -10px rgba(101,88,245,0.60)',
        'gold-glow': '0 0 0 1px rgba(130,131,251,0.40), 0 14px 34px -12px rgba(101,88,245,0.65)',
        'inner-hairline': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      borderRadius: {
        xl2: '1.125rem',
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
