/**
 * Crepe’s block-handle “+” flow calls `menuAPI.show()`; the slash menu opens without that call.
 * We flag the session so `buildMenu` can replace the full picker with a short curated list.
 */
let blockHandleAddMenuSession = false

export function setCrepeBlockHandleAddMenuSession(active: boolean): void {
  blockHandleAddMenuSession = active
}

export function isCrepeBlockHandleAddMenuSession(): boolean {
  return blockHandleAddMenuSession
}
