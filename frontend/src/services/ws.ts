/**
 * WebSocket clients (Yjs collab, project chat) — Slice 4+.
 * All WS connections must go through this module per frontend rules.
 */

export function notImplementedWs(): never {
  throw new Error('WebSocket not available until later slices')
}
