/** Display labels for token usage scope columns (backend sends names when available). */

export function usageScopeLabel(
  name: string | null | undefined,
  id: string | null,
): string {
  const n = name?.trim()
  if (n) return n
  if (id) return id
  return '—'
}

export function usageScopeTitle(
  name: string | null | undefined,
  id: string | null,
): string | undefined {
  const n = name?.trim()
  if (n && id) return `${n} (${id})`
  if (id) return id
  if (n) return n
  return undefined
}
