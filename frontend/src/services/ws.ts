/**
 * WebSocket helpers — Yjs collab (Slice 4). Connections use same-origin cookies
 * (atelier_token) via the Vite /ws proxy; optional ?token= for tooling only.
 */

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
