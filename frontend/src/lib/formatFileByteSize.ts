/** Human-readable file size (binary units). */
export function formatFileByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  if (i === 0) {
    return `${Math.round(v)} ${units[i]}`
  }
  const decimals = v < 10 ? 1 : v < 100 ? 1 : 0
  const s = v.toFixed(decimals)
  return `${s.endsWith('.0') ? s.slice(0, -2) : s} ${units[i]}`
}
