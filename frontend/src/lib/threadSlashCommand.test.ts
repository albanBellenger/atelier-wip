import { describe, expect, it } from 'vitest'

import {
  parseThreadComposerInput,
  parseThreadSlashInput,
} from './threadSlashCommand'

describe('parseThreadComposerInput', () => {
  it('maps /improve to improve_section', () => {
    const r = parseThreadComposerInput('/improve add metrics')
    expect(r.kind).toBe('improve_section')
    if (r.kind === 'improve_section') {
      expect(r.instruction).toBe('add metrics')
    }
  })

  it('defaults improve instruction when only slash', () => {
    const r = parseThreadComposerInput('  /improve  ')
    expect(r.kind).toBe('improve_section')
    if (r.kind === 'improve_section') {
      expect(r.instruction).toBeNull()
    }
  })

  it('maps /critique to stream with critique command', () => {
    const r = parseThreadComposerInput('/critique gaps?')
    expect(r.kind).toBe('stream')
    if (r.kind === 'stream') {
      expect(r.command).toBe('critique')
      expect(r.threadIntent).toBe('ask')
      expect(r.content).toBe('gaps?')
    }
  })

  it('maps /append', () => {
    const r = parseThreadComposerInput('/append more')
    expect(r.kind).toBe('stream')
    if (r.kind === 'stream') {
      expect(r.command).toBe('none')
      expect(r.threadIntent).toBe('append')
      expect(r.content).toBe('more')
    }
  })

  it('maps /replace', () => {
    const r = parseThreadComposerInput('/replace')
    expect(r.kind).toBe('stream')
    if (r.kind === 'stream') {
      expect(r.threadIntent).toBe('replace_selection')
      expect(r.content).toBe('Replace the selection as described.')
    }
  })

  it('maps /edit', () => {
    const r = parseThreadComposerInput('/edit fix typo')
    expect(r.kind).toBe('stream')
    if (r.kind === 'stream') {
      expect(r.threadIntent).toBe('edit')
      expect(r.content).toBe('fix typo')
    }
  })

  it('maps /ask', () => {
    const r = parseThreadComposerInput('/ask hello')
    expect(r.kind).toBe('stream')
    if (r.kind === 'stream') {
      expect(r.threadIntent).toBe('ask')
      expect(r.content).toBe('hello')
    }
  })

  it('treats plain text as ask stream', () => {
    const r = parseThreadComposerInput('hello /improve not-first')
    expect(r.kind).toBe('stream')
    if (r.kind === 'stream') {
      expect(r.command).toBe('none')
      expect(r.threadIntent).toBe('ask')
      expect(r.content).toBe('hello /improve not-first')
    }
  })
})

describe('parseThreadSlashInput', () => {
  it('still maps /improve for legacy stream command shape', () => {
    const r = parseThreadSlashInput('/improve add metrics')
    expect(r.command).toBe('improve')
    expect(r.content).toBe('add metrics')
  })

  it('returns none for plain text', () => {
    const r = parseThreadSlashInput('hello /improve not-first')
    expect(r.command).toBe('none')
    expect(r.content).toBe('hello /improve not-first')
  })
})
