import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// When the dev server runs inside Docker, compose sets this to http://backend:8000.
// Local `npm run dev` keeps the default.
const apiProxy = process.env.ATELIER_API_PROXY ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': { target: apiProxy, changeOrigin: true },
      '/admin': { target: apiProxy, changeOrigin: true },
      '/me': { target: apiProxy, changeOrigin: true },
      '/health': { target: apiProxy, changeOrigin: true },
      '/studios': { target: apiProxy, changeOrigin: true },
      '/software': { target: apiProxy, changeOrigin: true },
      '/projects': { target: apiProxy, changeOrigin: true },
      '/artifacts': { target: apiProxy, changeOrigin: true },
      '/mcp': { target: apiProxy, changeOrigin: true },
      '/ws': { target: apiProxy, changeOrigin: true, ws: true },
    },
  },
})
