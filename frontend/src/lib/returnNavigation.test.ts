import { describe, expect, it } from 'vitest'

import {
  appendReturnParamsToRelativeHref,
  mergePreserveReturnParams,
  safeReturnPath,
  sanitizeReturnLabel,
} from './returnNavigation'

describe('safeReturnPath', () => {
  it('accepts root and studio paths', () => {
    expect(safeReturnPath('/')).toBe('/')
    expect(safeReturnPath('/studios/s1')).toBe('/studios/s1')
    expect(safeReturnPath('/studios/s1/software/sw1')).toBe(
      '/studios/s1/software/sw1',
    )
  })

  it('rejects open redirects and auth', () => {
    expect(safeReturnPath('//evil.com')).toBeNull()
    expect(safeReturnPath('https://evil.com')).toBeNull()
    expect(safeReturnPath('/auth')).toBeNull()
    expect(safeReturnPath('/auth/callback')).toBeNull()
    expect(safeReturnPath('/admin')).toBeNull()
    expect(safeReturnPath('')).toBeNull()
  })

  it('decodes percent-encoded paths', () => {
    expect(safeReturnPath(encodeURIComponent('/studios/a'))).toBe('/studios/a')
  })
})

describe('sanitizeReturnLabel', () => {
  it('trims and caps length', () => {
    expect(sanitizeReturnLabel('  Hi  ')).toBe('Hi')
    const long = 'x'.repeat(100)
    const out = sanitizeReturnLabel(long)
    expect(out).toContain('…')
    expect(out!.length).toBeLessThanOrEqual(82)
  })
})

describe('appendReturnParamsToRelativeHref', () => {
  it('merges return params into existing query', () => {
    const href = appendReturnParamsToRelativeHref(
      '/llm-usage?project_id=p1&date_from=2026-01-01',
      '/studios/s1/software/sw1/projects/p1',
      'My project',
    )
    expect(href).toContain('returnTo=%2Fstudios%2Fs1%2Fsoftware%2Fsw1%2Fprojects%2Fp1')
    expect(href).toContain('returnLabel=')
    expect(href).toContain('project_id=p1')
  })
})

describe('mergePreserveReturnParams', () => {
  it('preserves returnTo from current when updating filters', () => {
    const current = new URLSearchParams(
      'returnTo=/studios/s1&returnLabel=Studio&studio_id=s1',
    )
    const merged = mergePreserveReturnParams('?studio_id=s1&limit=100', current)
    expect(merged).toContain('returnTo=%2Fstudios%2Fs1')
    expect(merged).toContain('limit=100')
  })

  it('drops invalid returnTo from current', () => {
    const current = new URLSearchParams('returnTo=https://evil.com')
    const merged = mergePreserveReturnParams('?limit=50', current)
    expect(merged).not.toContain('evil')
    expect(merged).toContain('limit=50')
  })
})
