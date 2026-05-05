/** Annotation + status styling — aligned with HealthRail semantic colours. */
export const ANN_TONE = {
  gap: 'rose',
  drift: 'amber',
  cite: 'violet',
  suggest: 'emerald',
} as const

export const ANN_HEX = {
  gap: '#fb7185',
  drift: '#fbbf24',
  cite: '#a78bfa',
  suggest: '#34d399',
} as const

export const ANN_GLYPH = {
  gap: '◆',
  drift: '↻',
  cite: '※',
  suggest: '✦',
} as const

/** Section status dot colours (toolbar / outline chrome). */
export const STATUS_DOT = {
  ok: '#34d399',
  warn: '#fbbf24',
  bad: '#fb7185',
} as const
