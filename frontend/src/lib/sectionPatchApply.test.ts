import type { EditorView } from '@milkdown/prose/view'
import { describe, expect, it } from 'vitest'

import {
  canApplyPatch,
  normalizePatchProposal,
} from './sectionPatchApply'

describe('sectionPatchApply', () => {
  it('normalizePatchProposal returns null for unknown shape', () => {
    expect(normalizePatchProposal(null)).toBeNull()
    expect(normalizePatchProposal({ intent: 'append' })).toBeNull()
  })

  it('normalizePatchProposal accepts replace_selection without offsets', () => {
    const p = normalizePatchProposal({
      intent: 'replace_selection',
      replacement_markdown: 'z',
    })
    expect(p).toEqual({
      intent: 'replace_selection',
      replacement_markdown: 'z',
    })
  })

  it('canApplyPatch blocks when snapshot drifted', () => {
    const gate = canApplyPatch(
      'hello',
      { intent: 'append', markdown_to_append: 'x' },
      { snapshot: 'hallo' },
    )
    expect(gate.ok).toBe(false)
  })

  it('canApplyPatch replace_selection allows when view omitted', () => {
    const gate = canApplyPatch(
      'hello',
      { intent: 'replace_selection', replacement_markdown: 'x' },
      { snapshot: 'hello' },
    )
    expect(gate.ok).toBe(true)
  })

  it('canApplyPatch replace_selection fails when selection empty', () => {
    const view = {
      state: { selection: { from: 2, to: 2 } },
    } as EditorView
    const gate = canApplyPatch(
      'hello',
      { intent: 'replace_selection', replacement_markdown: 'x' },
      { snapshot: 'hello' },
      view,
    )
    expect(gate.ok).toBe(false)
  })
})
