/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        crm: {
          bg: 'var(--crm-bg)',
          sidebar: 'var(--crm-sidebar)',
          card: 'var(--crm-card)',
          accent: 'var(--crm-accent)',
          'accent-hover': 'var(--crm-accent-hover)',
          text: 'var(--crm-text)',
          muted: 'var(--crm-muted)',
          success: 'var(--crm-success)',
          border: 'var(--crm-border)',
          hover: 'var(--crm-hover)',
          deep: 'var(--crm-deep)',
          overlay: 'var(--crm-overlay)',
          tooltip: 'var(--crm-tooltip)',
          panel: 'var(--crm-panel)',
        },
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(100%)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'row-appear': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'sheet-down': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'sheet-up': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px) scale(0.97)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'slide-out-right': 'slide-out-right 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'fade-in': 'fade-in 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'row-appear': 'row-appear 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'sheet-down': 'sheet-down 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'sheet-up': 'sheet-up 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
    },
  },
  plugins: [],
};
