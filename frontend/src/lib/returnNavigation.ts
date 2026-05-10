/** React Router location state key for in-app return navigation. */
export const RETURN_NAV_STATE_KEY = 'atelierReturnNav' as const

export interface ReturnNavPayload {
  path: string
  label: string
}

const RETURN_LABEL_MAX = 80

/** Same-origin path allowlist: ``/`` or paths under ``/studios/``. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let s = raw.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    return null
  }
  s = s.trim()
  if (s.length === 0 || s.length > 2048) return null
  if (!s.startsWith('/')) return null
  if (s.startsWith('//')) return null
  if (s.includes('\\') || s.includes(':')) return null
  const lower = s.toLowerCase()
  if (lower === '/auth' || lower.startsWith('/auth/')) return null
  if (s === '/') return '/'
  if (s.startsWith('/studios/')) return s
  return null
}

export function sanitizeReturnLabel(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  if (!oneLine) return null
  const noCtrl = oneLine.replace(/[\u0000-\u001f\u007f]/g, '')
  if (!noCtrl) return null
  return noCtrl.length > RETURN_LABEL_MAX
    ? `${noCtrl.slice(0, RETURN_LABEL_MAX)}…`
    : noCtrl
}

export function parseReturnNavFromLocationState(
  state: unknown,
): ReturnNavPayload | null {
  if (!state || typeof state !== 'object') return null
  const rec = state as Record<string, unknown>
  const block = rec[RETURN_NAV_STATE_KEY]
  if (!block || typeof block !== 'object') return null
  const b = block as Record<string, unknown>
  const path = typeof b.path === 'string' ? safeReturnPath(b.path) : null
  const labelRaw = typeof b.label === 'string' ? b.label : ''
  const label = sanitizeReturnLabel(labelRaw) ?? 'Previous page'
  if (!path) return null
  return { path, label }
}

/** Append ``returnTo`` / ``returnLabel`` to a relative app href (path + optional query). */
export function appendReturnParamsToRelativeHref(
  href: string,
  returnPath: string,
  returnLabel: string,
): string {
  const safe = safeReturnPath(returnPath)
  if (!safe) return href
  const qIdx = href.indexOf('?')
  const pathname = qIdx >= 0 ? href.slice(0, qIdx) : href
  const search = qIdx >= 0 ? href.slice(qIdx + 1) : ''
  const sp = new URLSearchParams(search)
  sp.set('returnTo', safe)
  const lab = sanitizeReturnLabel(returnLabel)
  if (lab) sp.set('returnLabel', lab)
  else sp.delete('returnLabel')
  const q = sp.toString()
  return q ? `${pathname}?${q}` : pathname
}

export function readReturnNavFromSearchParams(
  sp: URLSearchParams,
): ReturnNavPayload | null {
  const path = safeReturnPath(sp.get('returnTo'))
  if (!path) return null
  const label = sanitizeReturnLabel(sp.get('returnLabel')) ?? 'Previous page'
  return { path, label }
}

export function mergePreserveReturnParams(
  baseSearch: string,
  current: URLSearchParams,
): string {
  const sp = new URLSearchParams(
    baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch,
  )
  const path = safeReturnPath(current.get('returnTo'))
  if (path) {
    sp.set('returnTo', path)
    const lab = sanitizeReturnLabel(current.get('returnLabel'))
    if (lab) sp.set('returnLabel', lab)
    else sp.delete('returnLabel')
  } else {
    sp.delete('returnTo')
    sp.delete('returnLabel')
  }
  const q = sp.toString()
  return q ? `?${q}` : ''
}
