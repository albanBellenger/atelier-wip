import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as Y from 'yjs'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import type { YjsCollab } from '../../hooks/useYjsCollab'

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'rgb(9 9 11)',
      color: 'rgb(244 244 245)',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '13px',
    },
    '.cm-content': { caretColor: 'rgb(196 181 253)' },
    '.cm-activeLine': { backgroundColor: 'rgb(39 39 42 / 0.5)' },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'rgb(196 181 253)',
    },
    '&.cm-focused .cm-selectionBackground': {
      background: 'rgb(91 33 182 / 0.35) !important',
    },
  },
  { dark: true },
)

function useMarkdownPreview(ytext: Y.Text | undefined): string {
  const [text, setText] = useState(() => ytext?.toString() ?? '')
  useEffect(() => {
    if (!ytext) {
      setText('')
      return
    }
    const obs = () => setText(ytext.toString())
    ytext.observe(obs)
    obs()
    return () => ytext.unobserve(obs)
  }, [ytext])
  return text
}

export interface SplitEditorProps {
  collab: YjsCollab | null
}

export function SplitEditor({ collab }: SplitEditorProps): ReactElement {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const preview = useMarkdownPreview(collab?.ytext)

  const undoManager = useMemo(() => {
    if (!collab?.ytext) return null
    return new Y.UndoManager(collab.ytext)
  }, [collab?.ytext])

  useEffect(() => {
    const parent = parentRef.current
    if (!parent || !collab || !undoManager) {
      return
    }

    const state = EditorState.create({
      doc: collab.ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        markdown(),
        editorTheme,
        keymap.of([
          ...yUndoManagerKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        placeholder('Write Markdown…'),
        yCollab(collab.ytext, collab.awareness, { undoManager }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [collab, undoManager])

  return (
    <div className="grid min-h-[480px] grid-cols-1 gap-0 border border-zinc-800 lg:grid-cols-2">
      <div
        ref={parentRef}
        className="min-h-[280px] border-b border-zinc-800 lg:min-h-0 lg:border-b-0 lg:border-r"
      />
      <div className="max-h-[60vh] overflow-auto bg-zinc-950 p-4 text-sm text-zinc-300 lg:max-h-none [&_a]:text-violet-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-900">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
      </div>
    </div>
  )
}
