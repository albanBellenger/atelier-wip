import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import type { EditorViewMode } from '../section/sectionLayoutMode'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import {
  MilkdownEditor,
  type MilkdownEditorApi,
} from './MilkdownEditor'
import type { EditorSelectionState } from './editorSelection'

export type { EditorSelectionState } from './editorSelection'

const SAVE_SAVED_RESET_MS = 2500

export interface SplitEditorProps {
  collab: YjsCollab | null
  /** Canonical Markdown from REST for cold seed (must match `sections.content`). */
  defaultMarkdown: string
  /** When true, editor is display-only (no AI menus, no collab connect). */
  readOnly?: boolean
  onSelectionChange?: (sel: EditorSelectionState | null) => void
  viewMode?: EditorViewMode
  onViewModeChange?: (mode: EditorViewMode) => void
  patchOverlay?: SectionPatchOverlayState | null
  /** Optional ref to the underlying Milkdown surface (snapshots, patches). */
  editorApiRef?: React.RefObject<MilkdownEditorApi | null>
  /** Prefill section copilot composer from Milkdown AI menus. */
  onAiComposerPrefill?: (markdown: string) => void
  /** When true, /replace is omitted from the selection bubble (focus layout). */
  replaceSelectionSlashDisabled?: boolean
}

export function SplitEditor({
  collab,
  defaultMarkdown,
  readOnly = false,
  onSelectionChange,
  viewMode: viewModeProp,
  onViewModeChange,
  patchOverlay,
  editorApiRef,
  onAiComposerPrefill,
  replaceSelectionSlashDisabled = false,
}: SplitEditorProps): ReactElement {
  const isControlled =
    viewModeProp !== undefined && onViewModeChange !== undefined
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    useState<EditorViewMode>('markdown')
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
    if (!collab) {
      return
    }
    const ydoc = collab.ydoc
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
    ydoc.on('update', onY)
    return () => {
      ydoc.off('update', onY)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [collab])

  const [, bumpPreview] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    if (!collab) {
      return
    }
    const ydoc = collab.ydoc
    const onAfter = (): void => {
      bumpPreview()
    }
    ydoc.on('afterTransaction', onAfter)
    return () => {
      ydoc.off('afterTransaction', onAfter)
    }
  }, [collab])

  const internalEditorApiRef = useRef<MilkdownEditorApi | null>(null)
  const resolvedEditorRef = editorApiRef ?? internalEditorApiRef

  const previewMarkdown = useMemo(() => {
    const api = resolvedEditorRef.current
    if (api) {
      return api.getMarkdown()
    }
    return defaultMarkdown
  }, [resolvedEditorRef, defaultMarkdown, bumpPreview])

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

  const proseTabs = (['markdown', 'preview', 'split'] as const).map((mode) => {
    const label =
      mode === 'markdown' ? 'Editor' : mode === 'preview' ? 'Preview' : 'Split'
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
            data-testid="milkdown-host"
            style={editorPaneStyle}
            className={editorPaneClass}
          >
            {collab ? (
              <MilkdownEditor
                ref={resolvedEditorRef}
                collab={collab}
                defaultMarkdown={defaultMarkdown}
                readOnly={readOnly}
                onSelectionChange={onSelectionChange}
                patchOverlay={patchOverlay}
                onAiComposerPrefill={onAiComposerPrefill}
                replaceSelectionSlashDisabled={replaceSelectionSlashDisabled}
              />
            ) : (
              <p className="p-3 text-xs text-zinc-500">Connecting…</p>
            )}
          </div>
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {previewMarkdown}
              </ReactMarkdown>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
