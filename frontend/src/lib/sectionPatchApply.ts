import * as Y from 'yjs'

export type PatchProposalMeta =
  | {
      intent: 'append'
      markdown_to_append: string
      error?: string
    }
  | {
      intent: 'replace_selection'
      replacement_markdown: string
      selection_from: number
      selection_to: number
      error?: string
    }
  | {
      intent: 'edit'
      old_snippet: string
      new_snippet: string
      error?: string
    }
  | { error: string }

export interface PatchAnchor {
  snapshot: string
  selectionFrom?: number
  selectionTo?: number
}

export function isPatchIntentProposal(
  p: PatchProposalMeta,
): p is Exclude<PatchProposalMeta, { error: string }> {
  return 'intent' in p
}

export function canApplyPatch(
  ytext: Y.Text,
  proposal: PatchProposalMeta,
  anchor: PatchAnchor,
): { ok: true } | { ok: false; reason: string } {
  if ('error' in proposal && proposal.error) {
    return { ok: false, reason: proposal.error }
  }
  if (!isPatchIntentProposal(proposal)) {
    return { ok: false, reason: 'Invalid patch proposal.' }
  }
  const current = ytext.toString()
  if (current !== anchor.snapshot) {
    return {
      ok: false,
      reason:
        'The section changed since you sent this message. Send again or apply manually.',
    }
  }
  if (proposal.intent === 'append') {
    return { ok: true }
  }
  if (proposal.intent === 'replace_selection') {
    const { selection_from: from, selection_to: to } = proposal
    if (
      typeof from !== 'number' ||
      typeof to !== 'number' ||
      from < 0 ||
      to > current.length ||
      from > to
    ) {
      return { ok: false, reason: 'Invalid selection range for the current document.' }
    }
    if (current.slice(from, to) !== anchor.snapshot.slice(from, to)) {
      return { ok: false, reason: 'Selected region no longer matches the original text.' }
    }
    return { ok: true }
  }
  if (proposal.intent === 'edit') {
    const n = current.split(proposal.old_snippet).length - 1
    if (n !== 1) {
      return {
        ok: false,
        reason: `Snippet must appear exactly once (found ${String(n)}).`,
      }
    }
    return { ok: true }
  }
  return { ok: false, reason: 'Unknown patch intent.' }
}

export function applyPatchToYtext(
  ytext: Y.Text,
  proposal: PatchProposalMeta,
  anchor: PatchAnchor,
): { ok: true } | { ok: false; reason: string } {
  const gate = canApplyPatch(ytext, proposal, anchor)
  if (!gate.ok) {
    return gate
  }
  if (!isPatchIntentProposal(proposal)) {
    return { ok: false, reason: 'Invalid patch proposal.' }
  }
  const current = ytext.toString()
  if (proposal.intent === 'append') {
    const md = proposal.markdown_to_append ?? ''
    const insertAt = ytext.length
    const prefix =
      insertAt > 0 && !current.endsWith('\n') && md.length > 0 ? '\n\n' : insertAt > 0 ? '\n' : ''
    ytext.insert(insertAt, prefix + md)
    return { ok: true }
  }
  if (proposal.intent === 'replace_selection') {
    const { selection_from: from, selection_to: to, replacement_markdown: rep } = proposal
    const len = to - from
    ytext.delete(from, len)
    ytext.insert(from, rep ?? '')
    return { ok: true }
  }
  if (proposal.intent === 'edit') {
    const idx = current.indexOf(proposal.old_snippet)
    if (idx < 0) {
      return { ok: false, reason: 'Snippet not found.' }
    }
    const oldLen = proposal.old_snippet.length
    ytext.delete(idx, oldLen)
    ytext.insert(idx, proposal.new_snippet)
    return { ok: true }
  }
  return { ok: false, reason: 'Unknown patch intent.' }
}

export function normalizePatchProposal(
  raw: Record<string, unknown> | null | undefined,
): PatchProposalMeta | null {
  if (raw == null || typeof raw !== 'object') {
    return null
  }
  if (typeof raw.error === 'string' && raw.error) {
    return { error: raw.error }
  }
  const intent = raw.intent
  if (intent === 'append' && typeof raw.markdown_to_append === 'string') {
    return { intent: 'append', markdown_to_append: raw.markdown_to_append }
  }
  if (intent === 'replace_selection') {
    const from = Number(raw.selection_from)
    const to = Number(raw.selection_to)
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return { error: 'invalid_replace_selection_offsets' }
    }
    return {
      intent: 'replace_selection',
      replacement_markdown: String(raw.replacement_markdown ?? ''),
      selection_from: from,
      selection_to: to,
    }
  }
  if (intent === 'edit') {
    return {
      intent: 'edit',
      old_snippet: String(raw.old_snippet ?? ''),
      new_snippet: String(raw.new_snippet ?? ''),
    }
  }
  return null
}
