/** Short relative label from an ISO-8601 instant (UTC). */
export function formatRelativeTimeUtc(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const diffSec = Math.floor((Date.now() - t) / 1000)
  if (diffSec < 45) return 'just now'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d}d ago`
  return new Date(t).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
