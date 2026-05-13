import { describe, expect, it } from 'vitest'

import {
  composerPrefixForAiMenuItem,
  parsedInputForAiMenuItem,
} from './aiMenuActions'

describe('aiMenuActions', () => {
  it('maps append to stream append intent', () => {
    const p = parsedInputForAiMenuItem('append')
    expect(p?.kind).toBe('stream')
    if (p?.kind === 'stream') {
      expect(p.threadIntent).toBe('append')
    }
  })

  it('maps improve to improve_section', () => {
    const p = parsedInputForAiMenuItem('improve')
    expect(p?.kind).toBe('improve_section')
  })

  it('returns null for unknown id', () => {
    expect(parsedInputForAiMenuItem('unknown')).toBeNull()
  })

  it('composerPrefixForAiMenuItem returns slash prefix with trailing space', () => {
    expect(composerPrefixForAiMenuItem('append')).toBe('/append ')
    expect(composerPrefixForAiMenuItem('unknown')).toBeNull()
  })
})
