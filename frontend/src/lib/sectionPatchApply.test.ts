import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'

import {
  applyPatchToYtext,
  canApplyPatch,
  normalizePatchProposal,
} from './sectionPatchApply'

describe('sectionPatchApply', () => {
  it('normalizePatchProposal returns null for unknown shape', () => {
    expect(normalizePatchProposal(null)).toBeNull()
    expect(normalizePatchProposal({ intent: 'append' })).toBeNull()
  })

  it('normalizePatchProposal rejects non-finite replace offsets', () => {
    const p = normalizePatchProposal({
      intent: 'replace_selection',
      selection_from: 'x',
      selection_to: 1,
      replacement_markdown: 'z',
    })
    expect(p).toEqual({ error: 'invalid_replace_selection_offsets' })
  })

  it('canApplyPatch blocks when snapshot drifted', () => {
    const y = new Y.Doc()
    const t = y.getText('t')
    t.insert(0, 'hello')
    const gate = canApplyPatch(
      t,
      { intent: 'append', markdown_to_append: 'x' },
      { snapshot: 'hallo' },
    )
    expect(gate.ok).toBe(false)
  })

  it('applyPatchToYtext append', () => {
    const y = new Y.Doc()
    const t = y.getText('t')
    t.insert(0, 'a')
    const r = applyPatchToYtext(
      t,
      { intent: 'append', markdown_to_append: 'b' },
      { snapshot: 'a' },
    )
    expect(r.ok).toBe(true)
    expect(t.toString()).toBe('a\n\nb')
  })

  it('applyPatchToYtext replace_selection', () => {
    const y = new Y.Doc()
    const t = y.getText('t')
    t.insert(0, 'hello')
    const r = applyPatchToYtext(
      t,
      {
        intent: 'replace_selection',
        selection_from: 1,
        selection_to: 4,
        replacement_markdown: 'i',
      },
      { snapshot: 'hello', selectionFrom: 1, selectionTo: 4 },
    )
    expect(r.ok).toBe(true)
    expect(t.toString()).toBe('hio')
  })
})
