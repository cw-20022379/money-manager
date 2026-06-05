import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1419',
        panel: '#171c24',
        panel2: '#1e242e',
        line: '#2a3340',
        teal: '#4fd1c5',
        navy: '#5b8def',
        dim: '#93a1b3',
        ok: '#5ad19a',
        warn: '#f0a868',
        bad: '#f07a7a',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
