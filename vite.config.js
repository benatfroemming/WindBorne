import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/WindBorne',
  server: {
    proxy: {
      '/treasure': {
        target: 'https://a.windbornesystems.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

