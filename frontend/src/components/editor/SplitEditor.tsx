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
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import type { EditorViewMode } from '../section/sectionLayoutMode'
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
  /** When both are set, view mode is controlled and the internal tablist is hidden. */
  viewMode?: EditorViewMode
  onViewModeChange?: (mode: EditorViewMode) => void
  /** Optional LLM patch preview shown in the Markdown preview pane (Accept / Reject). */
  patchOverlay?: SectionPatchOverlayState | null
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
  viewMode: viewModeProp,
  onViewModeChange,
  patchOverlay,
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

  const isControlled =
    viewModeProp !== undefined && onViewModeChange !== undefined
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    useState<EditorViewMode>('split')
  const viewMode: EditorViewMode = isControlled
    ? viewModeProp
    : uncontrolledViewMode
  const setViewMode = (m: EditorViewMode): void => {
    if (isControlled) {
      onViewModeChange(m)
    } else {
      setUncontrolledViewMode(m)
    }
  }
  const layoutMode =
    viewMode === 'context' ? ('split' as const) : viewMode
  const showEditor = layoutMode !== 'preview'
  const showPreview = layoutMode !== 'markdown'
  const dualPane = showEditor && showPreview

  useEffect(() => {
    const parent = parentRef.current
    if (!showEditor || !parent || !collab || !undoManager) {
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
  }, [showEditor, collab, undoManager])

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

  const isRowSplit = layoutMode === 'split' && isLg

  const editorPaneStyle: import('react').CSSProperties = isRowSplit
    ? { width: `${leftPct}%`, minWidth: 0, flexShrink: 0 }
    : { minWidth: 0 }

  const previewPaneStyle: import('react').CSSProperties = isRowSplit
    ? { width: `${100 - leftPct}%`, minWidth: 0, flexShrink: 0 }
    : { minWidth: 0 }

  const outerFlexDir = isRowSplit
    ? 'flex min-h-[480px] flex-row overflow-hidden border border-zinc-800'
    : 'flex min-h-[480px] flex-col overflow-hidden border border-zinc-800'

  const editorPaneClass = dualPane
    ? 'min-h-[280px] min-w-0 border-b border-zinc-800 bg-zinc-950 lg:min-h-0 lg:border-b-0 lg:border-r lg:border-zinc-800'
    : 'min-h-[480px] min-w-0 flex-1 bg-zinc-950'

  const previewPaneClass = dualPane
    ? 'prose prose-invert prose-sm max-w-none min-h-0 max-h-[60vh] min-w-0 flex-1 overflow-auto bg-zinc-950 p-4 text-zinc-300 lg:max-h-none prose-a:text-violet-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-900'
    : 'prose prose-invert prose-sm max-w-none min-h-[480px] min-w-0 flex-1 overflow-auto bg-zinc-950 p-4 text-zinc-300 prose-a:text-violet-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-900'

  const proseTabs = (
    ['markdown', 'preview', 'split'] as const
  ).map((mode) => {
    const label =
      mode === 'markdown' ? 'Markdown' : mode === 'preview' ? 'Preview' : 'Split'
    return (
      <button
        key={mode}
        type="button"
        role="tab"
        aria-selected={viewMode === mode}
        className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
          viewMode === mode
            ? 'bg-zinc-800 text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
        onClick={() => setViewMode(mode)}
      >
        {label}
      </button>
    )
  })

  return (
    <div>
      <p
        className="mb-2 text-xs text-zinc-500"
        role="status"
        aria-live="polite"
      >
        {saveState === 'saving' ? 'Saving…' : 'Saved'}
      </p>
      {!isControlled ? (
        <div
          className="mb-2 flex flex-wrap gap-1.5 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-1"
          role="tablist"
          aria-label="Editor view"
        >
          {proseTabs}
        </div>
      ) : null}
      <div className={outerFlexDir}>
        {showEditor ? (
          <div
            ref={parentRef}
            data-testid="codemirror-host"
            style={editorPaneStyle}
            className={editorPaneClass}
          />
        ) : null}
        {isRowSplit ? (
          <button
            type="button"
            className="w-1.5 flex-shrink-0 cursor-col-resize border-0 bg-zinc-800 p-0 hover:bg-violet-900/40"
            aria-label="Resize panes"
            onMouseDown={onDividerMouseDown}
          />
        ) : null}
        {showPreview ? (
          <div
            data-testid="markdown-preview"
            style={isRowSplit ? previewPaneStyle : undefined}
            className={previewPaneClass}
          >
            {patchOverlay ? (
              <div
                className="space-y-3 rounded-lg border border-violet-500/40 bg-violet-950/10 p-3"
                data-testid="patch-inline-preview"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-violet-200">
                    Proposal preview
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!patchOverlay.canApply}
                      onClick={() => patchOverlay.onApply()}
                      className="rounded-md bg-violet-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => patchOverlay.onDismiss()}
                      className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
                    >
                      Reject
                    </button>
                  </div>
                </div>
                {!patchOverlay.canApply && patchOverlay.blockedReason ? (
                  <p className="text-[11px] text-rose-300">
                    {patchOverlay.blockedReason}
                  </p>
                ) : null}
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {patchOverlay.mergedMarkdown}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
