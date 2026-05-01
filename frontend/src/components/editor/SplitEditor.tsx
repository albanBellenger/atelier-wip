import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as Y from 'yjs'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import type { YjsCollab } from '../../hooks/useYjsCollab'

const SAVE_SAVED_RESET_MS = 2500

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

export interface EditorSelectionState {
  from: number
  to: number
  text: string
}

export interface SplitEditorProps {
  collab: YjsCollab | null
  onSelectionChange?: (sel: EditorSelectionState | null) => void
}

function selectionExtension(
  onChangeRef: MutableRefObject<
    ((sel: EditorSelectionState | null) => void) | undefined
  >,
) {
  return ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate): void {
        if (!update.selectionSet && !update.docChanged) {
          return
        }
        const fn = onChangeRef.current
        if (!fn) {
          return
        }
        const m = update.state.selection.main
        if (m.empty) {
          fn(null)
        } else {
          fn({
            from: m.from,
            to: m.to,
            text: update.state.sliceDoc(m.from, m.to),
          })
        }
      }
    },
  )
}

export function SplitEditor({
  collab,
  onSelectionChange,
}: SplitEditorProps): ReactElement {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onSelRef = useRef(onSelectionChange)
  onSelRef.current = onSelectionChange
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
        selectionExtension(onSelRef),
      ],
    })

    const view = new EditorView({ state, parent })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [collab, undoManager])

  const [saveState, setSaveState] = useState<'saving' | 'saved'>('saved')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isLg, setIsLg] = useState(false)
  const [leftPct, setLeftPct] = useState(50)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = (): void => {
      setIsLg(mq.matches)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
    }
  }, [])

  const collabYtext = collab?.ytext

  useEffect(() => {
    const p = collab?.provider as
      | {
          on?: (e: 'sync', fn: (s: boolean) => void) => void
          off?: (e: 'sync', fn: (s: boolean) => void) => void
        }
      | undefined
    if (p == null || typeof p.on !== 'function') {
      return
    }
    const onSync = (isSynced: boolean): void => {
      if (isSynced) {
        setSaveState('saved')
      }
    }
    p.on('sync', onSync)
    return () => p.off?.('sync', onSync)
  }, [collab])

  useEffect(() => {
    if (!collabYtext) {
      return
    }
    const onY = (): void => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      setSaveState('saving')
      saveTimerRef.current = setTimeout(() => {
        setSaveState('saved')
        saveTimerRef.current = null
      }, SAVE_SAVED_RESET_MS)
    }
    collabYtext.observe(onY)
    return () => {
      collabYtext.unobserve(onY)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [collabYtext])

  function onDividerMouseDown(
    e: import('react').MouseEvent<HTMLButtonElement>,
  ): void {
    e.preventDefault()
    if (!isLg) {
      return
    }
    const container = (e.currentTarget as HTMLButtonElement).parentElement
    if (!container) {
      return
    }
    const startX = e.clientX
    const startPct = leftPct
    const totalW = container.getBoundingClientRect().width
    if (totalW < 1) {
      return
    }

    const onMove = (me: globalThis.MouseEvent): void => {
      const dPct = ((me.clientX - startX) / totalW) * 100
      setLeftPct(Math.min(88, Math.max(12, startPct + dPct)))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const editorPaneStyle: import('react').CSSProperties = isLg
    ? { width: `${leftPct}%`, minWidth: 0, flexShrink: 0 }
    : { minWidth: 0 }

  const previewPaneStyle: import('react').CSSProperties = isLg
    ? { width: `${100 - leftPct}%`, minWidth: 0, flexShrink: 0 }
    : { minWidth: 0 }

  return (
    <div>
      <p
        className="mb-2 text-xs text-zinc-500"
        role="status"
        aria-live="polite"
      >
        {saveState === 'saving' ? 'Saving…' : 'Saved'}
      </p>
      <div
        className={
          isLg
            ? 'flex min-h-[480px] flex-row overflow-hidden border border-zinc-800'
            : 'flex min-h-[480px] flex-col overflow-hidden border border-zinc-800'
        }
      >
        <div
          ref={parentRef}
          style={editorPaneStyle}
          className="min-h-[280px] border-b border-zinc-800 bg-zinc-950 lg:min-h-0 lg:border-b-0 lg:border-r lg:border-zinc-800"
        />
        {isLg && (
          <button
            type="button"
            className="w-1.5 flex-shrink-0 cursor-col-resize border-0 bg-zinc-800 p-0 hover:bg-violet-900/40"
            aria-label="Resize panes"
            onMouseDown={onDividerMouseDown}
          />
        )}
        <div
          style={isLg ? previewPaneStyle : undefined}
          className="min-h-0 max-h-[60vh] min-w-0 flex-1 overflow-auto bg-zinc-950 p-4 text-sm text-zinc-300 lg:max-h-none [&_a]:text-violet-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-900"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
