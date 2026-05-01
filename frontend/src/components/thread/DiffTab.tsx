import { markdown } from '@codemirror/lang-markdown'
import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'

/** Side-by-side merge of current editor text vs structured improve output (Slice D). */
export function DiffTab(props: {
  original: string
  proposed: string
  onApply: () => void
}): ReactElement {
  const { original, proposed, onApply } = props
  const parentRef = useRef<HTMLDivElement>(null)
  const mergeRef = useRef<MergeView | null>(null)

  useEffect(() => {
    const el = parentRef.current
    if (!el) {
      return
    }
    mergeRef.current?.destroy()
    mergeRef.current = null
    const readOnly = [
      markdown(),
      oneDark,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
    ]
    mergeRef.current = new MergeView({
      parent: el,
      orientation: 'a-b',
      highlightChanges: true,
      a: { doc: original, extensions: readOnly },
      b: { doc: proposed, extensions: readOnly },
    })
    return () => {
      mergeRef.current?.destroy()
      mergeRef.current = null
    }
  }, [original, proposed])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 py-2"
      data-testid="diff-tab"
    >
      <p className="text-xs text-zinc-500">
        Left: current editor text. Right: last structured improve result.
      </p>
      <div
        ref={parentRef}
        className="min-h-[220px] flex-1 overflow-auto rounded border border-zinc-800 bg-zinc-950"
      />
      <button
        type="button"
        className="rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        disabled={!proposed.trim()}
        onClick={() => onApply()}
      >
        Replace editor with proposed
      </button>
    </div>
  )
}
