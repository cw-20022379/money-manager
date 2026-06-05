import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '우리 가족 금융 내비게이터',
        short_name: '가족금융',
        description: '부부 공동 가족 금융관리',
        theme_color: '#4fd1c5',
        background_color: '#0f1419',
        display: 'standalone',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // P2: GET만 캐시, mutation은 패스스루
        runtimeCaching: [
          {
            urlPattern: /^http:\/\/127\.0\.0\.1:3000\/api\//,
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'api-cache' },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});
