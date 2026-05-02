/** Short display label: first initial + last name, or single token. */
export function formatPersonShortLabel(name: string | null | undefined): string {
  const t = (name ?? '').trim()
  if (!t) return 'Someone'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const initial = parts[0][0]?.toUpperCase() ?? ''
  const last = parts[parts.length - 1]
  return `${initial}. ${last}`
}
