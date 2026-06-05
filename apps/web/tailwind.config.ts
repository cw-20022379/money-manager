import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        panel: '#ffffff',
        panel2: '#f7f6f3',
        line: '#ebeae8',
        teal: '#2383e2',
        navy: '#2383e2',
        dim: '#787774',
        ok: '#0f7b6c',
        warn: '#d9730d',
        bad: '#e03131',
        // Notion highlight palette
        highlight: {
          yellow: '#ffe066',
          green: '#0f7b6c',
          red: '#e03131',
          orange: '#d9730d',
          blue: '#2383e2',
        },
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        notion: '4px',
      },
      boxShadow: {
        notion: '0 1px 3px 0 rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
