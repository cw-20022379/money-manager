import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f7f7f7',
        panel: '#ffffff',
        panel2: '#f0f0f0',
        line: '#ececec',
        teal: '#1a1a1a',
        navy: '#454545',
        dim: '#6e6e6e',
        ok: '#3cb371',
        warn: '#e67e22',
        bad: '#e74c3c',
        kakao: '#fee500',
        'kakao-dark': '#1a1a1a',
        'kakao-sub': '#454545',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '28px',
      },
      boxShadow: {
        'card': '0 2px 12px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.10)',
        'kakao': '0 4px 16px rgba(254,229,0,0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
