/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
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
        premium: '0 1px 2px rgba(11,12,16,0.04), 0 8px 24px -8px rgba(11,12,16,0.12)',
        'premium-lg': '0 4px 12px rgba(11,12,16,0.06), 0 24px 48px -16px rgba(11,12,16,0.18)',
        gold: '0 8px 24px -8px rgba(194,154,86,0.35)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
