import type { Connect } from 'vite'
import type { Plugin } from 'vite'

/**
 * API never uses `GET /studios/.../software/.../projects/...` (projects are
 * `/software/{id}/projects/...` or `/projects/...`). These URLs are React
 * Router only; a document load must hit Vite, not the API proxy.
 *
 * Proxy `bypass` sees `req.url` without the `/studios` prefix, so we match
 * both shapes.
 */
export const STUDIOS_PROJECT_SPA_ABSOLUTE =
  /^\/studios\/[^/]+\/software\/[^/]+\/projects\/[^/]+(\/|$)/

export const STUDIOS_PROJECT_SPA_RELATIVE =
  /^\/[^/]+\/software\/[^/]+\/projects\/[^/]+(\/|$)/

export function isStudiosSoftwareProjectSpaPath(path: string): boolean {
  return (
    STUDIOS_PROJECT_SPA_ABSOLUTE.test(path) ||
    STUDIOS_PROJECT_SPA_RELATIVE.test(path)
  )
}

/**
 * Runs before the dev proxy so `GET …/studios/…/software/…/projects/…` is not
 * forwarded to FastAPI (which would 404). Rewrites the internal request URL to
 * `/`; the browser address bar is unchanged and React Router still sees the
 * real path.
 */
export function atelierStudiosProjectSpaPlugin(): Plugin {
  return {
    name: 'atelier-studios-project-spa-url',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(
        ((req: Connect.IncomingMessage, _res, next: Connect.NextFunction) => {
          if (req.method !== 'GET' || req.url == null) {
            next()
            return
          }
          const path = req.url.split('?')[0] ?? ''
          if (isStudiosSoftwareProjectSpaPath(path)) {
            req.url = '/'
          }
          next()
        }) as Connect.NextHandleFunction,
      )
    },
  }
}
