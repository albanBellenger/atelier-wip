import type { IncomingMessage } from 'node:http'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import {
  atelierStudiosProjectSpaPlugin,
  isStudiosSoftwareProjectSpaPath,
} from './viteSpaMiddleware'

// When the dev server runs inside Docker, compose sets this to http://backend:8000.
// Local `npm run dev` keeps the default.
const apiProxy = process.env.ATELIER_API_PROXY ?? 'http://127.0.0.1:8000'

/**
 * Other `/studios/...` paths overlap real APIs (e.g. `GET /studios/:id`). Only skip
 * the proxy for typical browser document loads so JSON fetches still reach the API.
 * (Project subtree under `/studios/.../software/.../projects/` is handled by
 * `atelierStudiosProjectSpaPlugin` instead.)
 */
function bypassBrowserDocumentToSpa(
  req: IncomingMessage,
): string | false | undefined {
  if (req.method !== 'GET') {
    return undefined
  }
  const path = (req.url ?? '').split('?')[0] ?? ''
  if (isStudiosSoftwareProjectSpaPath(path)) {
    return '/index.html'
  }
  if (req.headers['sec-fetch-mode'] === 'navigate') {
    return '/index.html'
  }
  const accept = req.headers.accept
  if (
    typeof accept === 'string' &&
    accept.includes('text/html') &&
    !accept.includes('application/json')
  ) {
    return '/index.html'
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [atelierStudiosProjectSpaPlugin(), react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': { target: apiProxy, changeOrigin: true },
      // Same pattern as /studios: browser navigations to /admin/console/* (and other /admin/* SPA
      // routes) must receive index.html; fetches still proxy to the API (Accept: application/json).
      '/admin': { target: apiProxy, changeOrigin: true, bypass: bypassBrowserDocumentToSpa },
      '/me': { target: apiProxy, changeOrigin: true },
      '/health': { target: apiProxy, changeOrigin: true },
      '/studios': {
        target: apiProxy,
        changeOrigin: true,
        bypass: bypassBrowserDocumentToSpa,
      },
      '/software': {
        target: apiProxy,
        changeOrigin: true,
        bypass: bypassBrowserDocumentToSpa,
      },
      '/projects': { target: apiProxy, changeOrigin: true },
      '/artifacts': { target: apiProxy, changeOrigin: true },
      '/mcp': { target: apiProxy, changeOrigin: true },
      '/ws': { target: apiProxy, changeOrigin: true, ws: true },
    },
  },
})
