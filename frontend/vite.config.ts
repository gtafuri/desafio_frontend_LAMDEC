import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/resumo': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/cda': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/kpis': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}) 