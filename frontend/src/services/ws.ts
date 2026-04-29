/**
 * WebSocket helpers — Yjs collab (Slice 4). Browser sends atelier_token via
 * Vite /ws same-origin proxy (cookies are forwarded to the API); `params.token`
 * matches backend collab `?token=` for environments where cookies are not sent
 * to the WebSocket.
 */

function readAtelierTokenFromDocument(): string | null {
  if (typeof document === 'undefined') {
    return null
  }
  const m = document.cookie.match(/(?:^|;\s*)atelier_token=([^;]*)/)
  if (!m?.[1]) {
    return null
  }
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

/** Shared Y.Text field — must match backend `YDOC_TEXT_FIELD` (codemirror). */
export const YDOC_TEXT_FIELD = 'codemirror'

function wsSchemeForHttp(url: URL): 'ws' | 'wss' {
  return url.protocol === 'https:' ? 'wss' : 'ws'
}

/**
 * Base URL passed to y-websocket as first arg (no trailing slash).
 * Final WS URL = `${base}/${roomName}` (+ optional query params).
 */
export function collabWebSocketBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  if (base) {
    const u = new URL(base)
    return `${wsSchemeForHttp(u)}//${u.host}/ws`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

/** Room segment appended to base (must match server `collab_room_path` after `/ws/`). */
export function collabRoomName(projectId: string, sectionId: string): string {
  return `projects/${projectId}/sections/${sectionId}/collab`
}

/** JWT for y-websocket query fallback; null if cookie unset (tests / SSR). */
export function atelierTokenForWebSocket(): string | null {
  return readAtelierTokenFromDocument()
}
