import type { EditorView } from '@milkdown/prose/view'
import type { Parser, Serializer } from '@milkdown/transformer'

import { insertAppendMarkdownFragment } from './sectionPatchApply'

const CHUNK = 56

/**
 * RAF-chunked append: streams `markdownTo_append` into the doc via repeated end inserts
 * (Strategy A — structured SSE meta, not raw token stream).
 */
export function startAnimateAppendMarkdown(
  view: EditorView,
  parser: Parser,
  serializer: Serializer,
  markdownToAppend: string,
  onComplete?: () => void,
): () => void {
  const md = markdownToAppend
  let from = 0
  let rafId = 0
  let cancelled = false

  const tick = (): void => {
    if (cancelled) {
      return
    }
    if (from >= md.length) {
      onComplete?.()
      return
    }
    const to = Math.min(from + CHUNK, md.length)
    const delta = md.slice(from, to)
    from = to
    try {
      insertAppendMarkdownFragment(view, parser, serializer, delta)
    } catch {
      /* ignore invalid partial markdown */
    }
    rafId = window.requestAnimationFrame(tick)
  }

  if (md.length === 0) {
    onComplete?.()
    return () => {}
  }
  rafId = window.requestAnimationFrame(tick)
  return () => {
    cancelled = true
    window.cancelAnimationFrame(rafId)
  }
}
