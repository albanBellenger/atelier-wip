import type { EditorView } from '@milkdown/prose/view'
import { TextSelection } from '@milkdown/prose/state'

/** Remove `/…` filter text in the current textblock (slash menu trigger). */
export function deleteSlashInputRange(view: EditorView): void {
  const { state } = view
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.empty) {
    return
  }
  const $from = sel.$from
  if (!$from.parent.isTextblock) {
    return
  }
  const start = $from.start()
  const textBefore = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    '\ufffc',
  )
  const slashIdx = textBefore.lastIndexOf('/')
  if (slashIdx < 0) {
    return
  }
  const from = start + slashIdx
  const to = $from.pos
  if (from >= to) {
    return
  }
  view.dispatch(state.tr.deleteRange(from, to).scrollIntoView())
}
