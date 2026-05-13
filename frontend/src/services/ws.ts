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
    return `${wsSchemeForHttp(u)}://${u.host}/ws`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

/** Room segment appended to base (must match server `collab_room_path` after `/ws/`). */
export function collabRoomName(projectId: string, sectionId: string): string {
  return `projects/${projectId}/sections/${sectionId}/collab`
}

/** Room segment for software-wide Markdown docs (matches ``software_docs_collab_room_path`` without ``/ws`` prefix). */
export function softwareDocCollabRoomName(
  softwareId: string,
  sectionId: string,
): string {
  return `software/${softwareId}/docs/${sectionId}/collab`
}

/** JWT for y-websocket query fallback; null if cookie unset (tests / SSR). */
export function atelierTokenForWebSocket(): string | null {
  return readAtelierTokenFromDocument()
}

/** WebSocket URL for project-wide chat (Slice 10). */
export function projectChatWebSocketUrl(projectId: string): string {
  const base = collabWebSocketBaseUrl()
  return `${base}/projects/${projectId}/chat`
}

/** Opens project chat WebSocket (same-origin `/ws` proxy, optional `?token=`). */
export function openProjectChatWebSocket(projectId: string): WebSocket {
  const token = atelierTokenForWebSocket()
  const url = new URL(projectChatWebSocketUrl(projectId))
  if (token) url.searchParams.set('token', token)
  return new WebSocket(url.toString())
}

/** WebSocket URL for software-wide chat. */
export function softwareChatWebSocketUrl(softwareId: string): string {
  const base = collabWebSocketBaseUrl()
  return `${base}/software/${softwareId}/chat`
}

/** Opens software chat WebSocket (same-origin `/ws` proxy, optional `?token=`). */
export function openSoftwareChatWebSocket(softwareId: string): WebSocket {
  const token = atelierTokenForWebSocket()
  const url = new URL(softwareChatWebSocketUrl(softwareId))
  if (token) url.searchParams.set('token', token)
  return new WebSocket(url.toString())
}
