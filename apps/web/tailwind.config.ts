import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        panel: '#f8fafc',
        panel2: '#f1f5f9',
        line: '#e2e8f0',
        teal: '#00d2c4',
        navy: '#0bbcb0',
        dim: '#64748b',
        dim2: '#94a3b8',
        ok: '#00d2c4',
        warn: '#f59e0b',
        bad: '#ef4444',
        body: '#1c1f26',
        purple: '#8b5cf6',
        blue: '#3b82f6',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px 0 rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
