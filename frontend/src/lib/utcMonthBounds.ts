/** Calendar month bounds in UTC as ``YYYY-MM-DD`` for URL query params. */
export type UtcMonthBounds = { date_from: string; date_to: string }

export function utcMonthBoundsForDate(d: Date = new Date()): UtcMonthBounds {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const date_from = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const date_to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { date_from, date_to }
}

export function withUtcMonthQuery(
  search: string,
  d: Date = new Date(),
): string {
  const { date_from, date_to } = utcMonthBoundsForDate(d)
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  sp.set('date_from', date_from)
  sp.set('date_to', date_to)
  const q = sp.toString()
  return q ? `?${q}` : `?date_from=${date_from}&date_to=${date_to}`
}
