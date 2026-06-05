import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // System backgrounds
        bg: '#f2f2f7',
        bg2: '#e5e5ea',
        // Panels (glassmorphism)
        panel: 'rgba(255,255,255,0.72)',
        panel2: 'rgba(255,255,255,0.88)',
        // Borders
        line: 'rgba(0,0,0,0.06)',
        // Text hierarchy
        text: '#1c1c1e',
        sub: '#3c3c43',
        dim: '#8e8e93',
        dim2: '#c7c7cc',
        // iOS system colors
        teal: '#007aff',    // iOS Blue (CTA, links, active)
        navy: '#5856d6',    // iOS Indigo
        ok: '#34c759',      // iOS Green
        warn: '#ff9500',    // iOS Orange
        bad: '#ff3b30',     // iOS Red
        // Additional iOS colors
        pink: '#ff2d55',
        purple: '#af52de',
        mint: '#00c7be',
      },
      fontFamily: {
        sans: ['-apple-system', 'SF Pro Display', 'SF Pro Text', 'Pretendard', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      borderRadius: {
        'ios': '14px',
        'ios-lg': '18px',
        'card': '22px',
      },
      backdropBlur: {
        'ios': '20px',
        'ios-sm': '12px',
      },
      boxShadow: {
        'card': '0 8px 24px -8px rgba(0,0,0,0.15)',
        'card-hover': '0 12px 32px -8px rgba(0,0,0,0.20)',
        'nav': '0 -1px 0 rgba(0,0,0,0.08), 0 -8px 24px -8px rgba(0,0,0,0.06)',
        'modal': '0 24px 64px -12px rgba(0,0,0,0.25)',
        'toast': '0 8px 32px -4px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
