import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Toss light theme — keep token names, replace values
        bg: '#ffffff',
        panel: '#ffffff',
        panel2: '#f2f4f6',
        line: '#e5e8eb',
        teal: '#3182f6',   // Toss Blue — CTA, active, key numbers
        navy: '#1a6fd8',   // Toss Blue darker (hover / focus)
        dim: '#8b95a1',
        ok: '#1bbf76',
        warn: '#ff9500',
        bad: '#f04452',
        // Extra surface tokens
        surface: '#f9fafb',
        body: '#191f28',
        sub: '#4e5968',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
