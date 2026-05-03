import { describe, expect, it } from 'vitest'

import { parseApiError } from './parseApiError'

describe('parseApiError', () => {
  it('maps API error body with string detail', () => {
    const p = parseApiError({ code: 'FORBIDDEN', detail: 'No access' })
    expect(p.title).toBe('Access denied')
    expect(p.message).toBe('No access')
    expect(p.code).toBe('FORBIDDEN')
  })

  it('defaults code when missing', () => {
    const p = parseApiError({ detail: 'oops' })
    expect(p.code).toBe('HTTP_ERROR')
    expect(p.message).toBe('oops')
  })

  it('maps Error instances', () => {
    const p = parseApiError(new Error('network'))
    expect(p.title).toBe('Error')
    expect(p.message).toBe('network')
    expect(p.code).toBeUndefined()
  })

  it('formats array validation detail', () => {
    const p = parseApiError({
      code: 'VALIDATION_ERROR',
      detail: [{ type: 'missing', loc: ['body', 'x'] }],
    })
    expect(p.title).toBe('Invalid input')
    expect(p.message).toContain('missing')
  })

  it('returns Invalid response when detail is not JSON-serialisable', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const p = parseApiError({ code: 'HTTP_ERROR', detail: circular })
    expect(p.message).toBe('Invalid response')
  })
})
