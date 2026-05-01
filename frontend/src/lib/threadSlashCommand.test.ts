import { describe, expect, it } from 'vitest'

import { parseThreadSlashInput } from './threadSlashCommand'

describe('parseThreadSlashInput', () => {
  it('maps /improve prefix', () => {
    const r = parseThreadSlashInput('/improve add metrics')
    expect(r.command).toBe('improve')
    expect(r.content).toBe('add metrics')
  })

  it('defaults improve message when only slash', () => {
    const r = parseThreadSlashInput('  /improve  ')
    expect(r.command).toBe('improve')
    expect(r.content.length).toBeGreaterThan(0)
  })

  it('maps /critique prefix', () => {
    const r = parseThreadSlashInput('/critique gaps?')
    expect(r.command).toBe('critique')
    expect(r.content).toBe('gaps?')
  })

  it('returns none for plain text', () => {
    const r = parseThreadSlashInput('hello /improve not-first')
    expect(r.command).toBe('none')
    expect(r.content).toBe('hello /improve not-first')
  })
})
