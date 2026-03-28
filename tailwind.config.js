/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // Global font-size scale bump: every tier ~2px larger for readability
    fontSize: {
      'xs':   ['0.85rem',  { lineHeight: '1.25rem' }],   // 13.6px (was 12px)
      'sm':   ['0.95rem',  { lineHeight: '1.4rem' }],    // 15.2px (was 14px)
      'base': ['1.1rem',   { lineHeight: '1.65rem' }],   // 17.6px (was 16px)
      'lg':   ['1.25rem',  { lineHeight: '1.85rem' }],   // 20px   (was 18px)
      'xl':   ['1.4rem',   { lineHeight: '2rem' }],      // 22.4px (was 20px)
      '2xl':  ['1.65rem',  { lineHeight: '2.2rem' }],    // 26.4px (was 24px)
      '3xl':  ['2rem',     { lineHeight: '2.5rem' }],    // 32px   (was 30px)
      '4xl':  ['2.5rem',   { lineHeight: '2.75rem' }],   // 40px   (was 36px)
      '5xl':  ['3.25rem',  { lineHeight: '1' }],         // 52px   (was 48px)
      '6xl':  ['4rem',     { lineHeight: '1' }],         // 64px   (was 60px)
    },
    extend: {
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
      },
      colors: {
        primary: {
          DEFAULT: '#2196F3',
          dark: '#1976D2',
          light: '#E3F2FD',
        },
        success: '#4CAF50',
        warning: '#FF9800',
        error: '#F44336',
        'text-primary': '#212121',
        'text-secondary': '#757575',
      },
      spacing: {
        'small': '8px',
        'medium': '16px',
        'large': '24px',
        'xlarge': '32px',
      },
    },
  },
  plugins: [],
}

