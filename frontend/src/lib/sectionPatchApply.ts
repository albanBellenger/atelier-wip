import type { EditorView } from '@milkdown/prose/view'
import { Slice } from '@milkdown/prose/model'
import type { Parser, Serializer } from '@milkdown/transformer'

export type PatchProposalMeta =
  | {
      intent: 'append'
      markdown_to_append: string
      error?: string
    }
  | {
      intent: 'replace_selection'
      replacement_markdown: string
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
  /** Client-selected plaintext at send time (preview for replace_selection). */
  selectedPlaintext?: string
}

export function isPatchIntentProposal(
  p: PatchProposalMeta,
): p is Exclude<PatchProposalMeta, { error: string }> {
  return 'intent' in p
}

export function canApplyPatch(
  currentMarkdown: string,
  proposal: PatchProposalMeta,
  anchor: PatchAnchor,
  view?: EditorView | null,
): { ok: true } | { ok: false; reason: string } {
  if ('error' in proposal && proposal.error) {
    return { ok: false, reason: proposal.error }
  }
  if (!isPatchIntentProposal(proposal)) {
    return { ok: false, reason: 'Invalid patch proposal.' }
  }
  if (currentMarkdown !== anchor.snapshot) {
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
    if (view == null) {
      return { ok: true }
    }
    const { from, to } = view.state.selection
    if (from === to) {
      return { ok: false, reason: 'No selection to replace.' }
    }
    return { ok: true }
  }
  if (proposal.intent === 'edit') {
    const n = currentMarkdown.split(proposal.old_snippet).length - 1
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

function parseFragment(parser: Parser, markdown: string) {
  const root = parser(markdown)
  return root.content
}

/** Replace entire document body from Markdown (used by edit patch + stream animation). */
export function replaceDocFromMarkdown(
  view: EditorView,
  parser: Parser,
  fullMarkdown: string,
): void {
  const frag = parseFragment(parser, fullMarkdown)
  const { state } = view
  view.dispatch(
    state.tr.replaceWith(0, state.doc.content.size, frag).scrollIntoView(),
  )
}

/** Insert Markdown at document end (same separator rules as append patch). */
export function insertAppendMarkdownFragment(
  view: EditorView,
  parser: Parser,
  serializer: Serializer,
  fragmentMd: string,
): void {
  if (fragmentMd.length === 0) {
    return
  }
  const current = serializer(view.state.doc)
  const { state } = view
  const md = fragmentMd
  const prefix =
    state.doc.content.size > 0 &&
    !current.endsWith('\n') &&
    md.length > 0
      ? '\n\n'
      : current.length > 0 && md.length > 0
        ? '\n'
        : ''
  const frag = parseFragment(parser, prefix + md)
  const tr = state.tr.insert(state.doc.content.size, frag)
  view.dispatch(tr.scrollIntoView())
}

export function applyPatchToEditor(
  view: EditorView,
  parser: Parser,
  serializer: Serializer,
  proposal: PatchProposalMeta,
  anchor: PatchAnchor,
): { ok: true } | { ok: false; reason: string } {
  const current = serializer(view.state.doc)
  const gate = canApplyPatch(current, proposal, anchor, view)
  if (!gate.ok) {
    return gate
  }
  if (!isPatchIntentProposal(proposal)) {
    return { ok: false, reason: 'Invalid patch proposal.' }
  }
  const { state } = view
  if (proposal.intent === 'append') {
    insertAppendMarkdownFragment(
      view,
      parser,
      serializer,
      proposal.markdown_to_append ?? '',
    )
    return { ok: true }
  }
  if (proposal.intent === 'replace_selection') {
    const { from, to } = state.selection
    if (from === to) {
      return { ok: false, reason: 'No selection to replace.' }
    }
    const frag = parseFragment(parser, proposal.replacement_markdown ?? '')
    const slice = new Slice(frag, 0, 0)
    const tr = state.tr.replaceRange(from, to, slice)
    view.dispatch(tr.scrollIntoView())
    return { ok: true }
  }
  if (proposal.intent === 'edit') {
    const idx = current.indexOf(proposal.old_snippet)
    if (idx < 0) {
      return { ok: false, reason: 'Snippet not found.' }
    }
    const nextMd =
      current.slice(0, idx) +
      proposal.new_snippet +
      current.slice(idx + proposal.old_snippet.length)
    replaceDocFromMarkdown(view, parser, nextMd)
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
    return {
      intent: 'replace_selection',
      replacement_markdown: String(raw.replacement_markdown ?? ''),
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
