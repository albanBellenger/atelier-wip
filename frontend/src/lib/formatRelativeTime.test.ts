import { describe, expect, it, vi } from 'vitest'

import { formatRelativeTimeUtc } from './formatRelativeTime'

describe('formatRelativeTimeUtc', () => {
  it('returns null for empty input', () => {
    expect(formatRelativeTimeUtc(null)).toBeNull()
    expect(formatRelativeTimeUtc('')).toBeNull()
  })

  it('formats minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTimeUtc(d)).toBe('5m ago')
  })

  it('uses fixed time for hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T14:00:00.000Z'))
    expect(formatRelativeTimeUtc('2026-05-01T10:00:00.000Z')).toBe('4h ago')
    vi.useRealTimers()
  })

  it('formats one calendar day as yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T14:00:00.000Z'))
    expect(formatRelativeTimeUtc('2026-05-01T14:00:00.000Z')).toBe('yesterday')
    vi.useRealTimers()
  })
})
