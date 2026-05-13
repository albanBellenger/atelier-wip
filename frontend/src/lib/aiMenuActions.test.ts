import { describe, expect, it } from 'vitest'

import {
  AI_MENU_ITEM_IDS,
  aiMenuItemMeta,
  composerPrefixForAiMenuItem,
  composerRawLineForMenuExecute,
  executionModeForAiMenuItem,
  parsedInputForAiMenuItem,
} from './aiMenuActions'

describe('aiMenuActions', () => {
  it('defines execution mode and default content per item', () => {
    expect(aiMenuItemMeta('improve')).toEqual({
      executionMode: 'execute',
      defaultContent: null,
    })
    expect(aiMenuItemMeta('critique')).toEqual({
      executionMode: 'execute',
      defaultContent: 'Critique this section for gaps and risks.',
    })
    expect(aiMenuItemMeta('append')).toEqual({
      executionMode: 'execute',
      defaultContent: 'Append helpful content to the end of this section.',
    })
    expect(aiMenuItemMeta('ask')).toEqual({
      executionMode: 'prefill',
      defaultContent: null,
    })
    expect(aiMenuItemMeta('edit')).toEqual({
      executionMode: 'prefill',
      defaultContent: null,
    })
    expect(aiMenuItemMeta('replace')).toEqual({
      executionMode: 'prefill',
      defaultContent: null,
    })
  })

  it('exposes stable ordered ids', () => {
    expect(AI_MENU_ITEM_IDS).toEqual([
      'append',
      'replace',
      'edit',
      'ask',
      'improve',
      'critique',
    ])
  })

  it('composerRawLineForMenuExecute returns only for execute items', () => {
    expect(composerRawLineForMenuExecute('improve')).toBe('/improve')
    expect(composerRawLineForMenuExecute('critique')).toBe('/critique')
    expect(composerRawLineForMenuExecute('append')).toBe('/append')
    expect(composerRawLineForMenuExecute('ask')).toBeNull()
    expect(composerRawLineForMenuExecute('edit')).toBeNull()
  })

  it('executionModeForAiMenuItem matches composerRawLine presence', () => {
    for (const id of AI_MENU_ITEM_IDS) {
      const raw = composerRawLineForMenuExecute(id)
      if (executionModeForAiMenuItem(id) === 'execute') {
        expect(raw).toBeTruthy()
      } else {
        expect(raw).toBeNull()
      }
    }
  })

  it('composerPrefixForAiMenuItem matches slash prefill', () => {
    expect(composerPrefixForAiMenuItem('ask')).toBe('/ask ')
  })

  it('parsedInputForAiMenuItem parses each prefix', () => {
    const p = parsedInputForAiMenuItem('append')
    expect(p?.kind).toBe('stream')
    if (p?.kind === 'stream') {
      expect(p.threadIntent).toBe('append')
    }
  })
})
