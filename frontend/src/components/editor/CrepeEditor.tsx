import { collab as collabPlugin, collabServiceCtx, CollabReady } from '@milkdown/plugin-collab'
import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe'
import { editorViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/prose/view'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
} from 'react'

import {
  dispatchBlockHandlePointerProbe,
  findFirstParagraphEl,
  getBlockHandleProbeClientX,
  hideBlockHandleViaPointerProbe,
  queryVisibleBlockHandle,
  readEditorBlockHandleFirstRunDone,
  writeEditorBlockHandleFirstRunDone,
} from '../../lib/editorBlockHandleOnboarding'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import {
  applyPatchToEditor,
  type PatchAnchor,
  type PatchProposalMeta,
} from '../../lib/sectionPatchApply'
import { startAnimateAppendMarkdown } from '../../lib/sectionStreamApply'
import { AiComposerPrefillProvider } from './aiComposerPrefillContext'
import { setCrepeBlockHandleAddMenuSession } from './crepeBlockAddMenuScope'
import {
  crepeBlockEditBuildMenu,
  crepeToolbarBuildToolbar,
  type CrepeCopilotMenuCallbacks,
} from './crepeCopilotMenus'
import {
  createIssueGutterMilkdownPlugin,
  dispatchIssueGutterRefresh,
} from './crepeIssueGutterPlugin'
import { EditorBlockHandleOnboardingTooltip } from './EditorBlockHandleOnboardingTooltip'
import type { EditorSelectionState } from './editorSelection'
import type { IssueGutterMark } from './issueGutterSpec'

import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame-dark.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import './crepeAtelierTheme.css'

const SNAPSHOT_DEBOUNCE_MS = 2000

/** Aligned with Crepe block-edit `menuAPI` (`$ctx(..., 'menuAPICtx')`). Resolved by name via Milkdown `ctx.get`. */
const CREPE_BLOCK_EDIT_MENU_API_NAME = 'menuAPICtx' as const

interface CrepeBlockEditMenuApi {
  show: (pos: number) => void
  hide: () => void
}

export interface CrepeEditorApi {
  getEditorView: () => EditorView | null
  getMarkdown: () => string
  replaceFullMarkdown: (markdown: string) => void
  applyPatch: (
    proposal: PatchProposalMeta,
    anchor: PatchAnchor,
  ) => { ok: true } | { ok: false; reason: string }
  animateAppendFromMarkdown: (markdown: string) => Promise<void>
}

export interface CrepeEditorProps {
  collab: YjsCollab | null
  defaultMarkdown: string
  readOnly?: boolean
  /** Fires after the editor instance is ready (and again after collab bind when applicable). */
  onEditorReady?: () => void
  onSelectionChange?: (sel: EditorSelectionState | null) => void
  patchOverlay?: SectionPatchOverlayState | null
  onAiComposerPrefill?: (markdown: string) => void
  onCopilotSlashExecute?: (rawComposerLine: string) => void | Promise<void>
  replaceSelectionSlashDisabled?: boolean
  /** Open gap/conflict issues with heading anchors — gutter widgets in the editor. */
  issueGutterMarks?: readonly IssueGutterMark[]
}

/** Exported for unit tests. Crepe can fire `selectionUpdated` before `editorViewCtx` is ready. */
export function pmSelectionToEditorState(
  view: EditorView | null | undefined,
  snapshotMarkdown: string,
): EditorSelectionState | null {
  if (view?.state == null) {
    return null
  }
  const from = view.state.selection.from
  const to = view.state.selection.to
  if (from === to) {
    return null
  }
  const text = view.state.doc.textBetween(from, to, '\n', '\n')
  if (!text) {
    return null
  }
  const idx = snapshotMarkdown.indexOf(text)
  const start = idx >= 0 ? idx : 0
  const end = idx >= 0 ? idx + text.length : text.length
  return { from: start, to: end, text }
}

const CrepeEditorInner = forwardRef<CrepeEditorApi, CrepeEditorProps>(
  function CrepeEditorInner(
    {
      collab,
      defaultMarkdown,
      readOnly = false,
      onEditorReady,
      onSelectionChange,
      patchOverlay: _patchOverlay,
      onAiComposerPrefill,
      onCopilotSlashExecute,
      replaceSelectionSlashDisabled = false,
      issueGutterMarks,
    },
    ref,
  ): ReactElement {
    const canEdit = !readOnly
    const outerRef = useRef<HTMLDivElement>(null)
    const crepeRootRef = useRef<HTMLDivElement>(null)
    const crepeRef = useRef<Crepe | null>(null)
    const lastMarkdownRef = useRef<string>(defaultMarkdown)
    const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onSelRef = useRef(onSelectionChange)
    onSelRef.current = onSelectionChange
    const readOnlyRef = useRef(readOnly)
    readOnlyRef.current = readOnly
    const collabRef = useRef<YjsCollab | null>(collab)
    collabRef.current = collab
    const cancelAnimateRef = useRef<(() => void) | null>(null)
    const copilotCallbacksRef = useRef<CrepeCopilotMenuCallbacks>({})
    copilotCallbacksRef.current = {
      onAiComposerPrefill,
      onCopilotSlashExecute,
      replaceSelectionDisabled: replaceSelectionSlashDisabled,
    }
    const onEditorReadyRef = useRef(onEditorReady)
    onEditorReadyRef.current = onEditorReady
    const issueGutterMarksRef = useRef<readonly IssueGutterMark[]>([])
    issueGutterMarksRef.current = issueGutterMarks ?? []

    const [loading, setLoading] = useState(true)
    const [blockOnboardingRect, setBlockOnboardingRect] =
      useState<DOMRectReadOnly | null>(null)
    const blockOnboardingViewRef = useRef<EditorView | null>(null)

    useImperativeHandle(
      ref,
      () => ({
        getEditorView: (): EditorView | null => {
          const c = crepeRef.current
          if (!c) {
            return null
          }
          return c.editor.action((ctx) => ctx.get(editorViewCtx))
        },
        getMarkdown: (): string => {
          const c = crepeRef.current
          if (!c) {
            return lastMarkdownRef.current
          }
          try {
            const md = c.getMarkdown()
            lastMarkdownRef.current = md
            return md
          } catch {
            try {
              return c.editor.action((ctx) => {
                const view = ctx.get(editorViewCtx)
                const serializer = ctx.get(serializerCtx)
                const md = serializer(view.state.doc)
                lastMarkdownRef.current = md
                return md
              })
            } catch {
              return lastMarkdownRef.current
            }
          }
        },
        replaceFullMarkdown: (markdown: string): void => {
          const c = crepeRef.current
          if (!c) {
            return
          }
          lastMarkdownRef.current = markdown
          void c.editor.action((ctx) => {
            const svc = ctx.get(collabServiceCtx)
            svc.applyTemplate(markdown, () => true)
          })
        },
        applyPatch: (
          proposal: PatchProposalMeta,
          anchor: PatchAnchor,
        ): { ok: true } | { ok: false; reason: string } => {
          const c = crepeRef.current
          if (!c) {
            return { ok: false, reason: 'Editor not ready.' }
          }
          return c.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx)
            const parser = ctx.get(parserCtx)
            const serializer = ctx.get(serializerCtx)
            return applyPatchToEditor(view, parser, serializer, proposal, anchor)
          })
        },
        animateAppendFromMarkdown: (markdown: string): Promise<void> => {
          const c = crepeRef.current
          if (!c) {
            return Promise.resolve()
          }
          cancelAnimateRef.current?.()
          return new Promise((resolve) => {
            void c.editor.action((ctx) => {
              const view = ctx.get(editorViewCtx)
              const parser = ctx.get(parserCtx)
              const serializer = ctx.get(serializerCtx)
              cancelAnimateRef.current = startAnimateAppendMarkdown(
                view,
                parser,
                serializer,
                markdown,
                () => {
                  cancelAnimateRef.current = null
                  lastMarkdownRef.current = serializer(view.state.doc)
                  resolve()
                },
              )
            })
          })
        },
      }),
      [],
    )

    useEffect(() => {
      const mountRoot = crepeRootRef.current
      if (!mountRoot) {
        return
      }
      let cancelled = false
      lastMarkdownRef.current = defaultMarkdown

      const features: CrepeConfig['features'] = readOnly
        ? {
            [CrepeFeature.BlockEdit]: false,
            [CrepeFeature.Toolbar]: false,
            [CrepeFeature.TopBar]: false,
            [CrepeFeature.AI]: false,
          }
        : undefined

      const featureConfigs = (
        canEdit
          ? {
              [CrepeFeature.BlockEdit]: {
                buildMenu: crepeBlockEditBuildMenu(() => copilotCallbacksRef.current),
              },
              [CrepeFeature.Toolbar]: {
                // First bubble appearance is delayed via `patches/@milkdown+crepe+7.21.0.patch`
                // (Milkdown’s TooltipProvider uses a leading throttle, so a high `debounce` alone does not help).
                buildToolbar: crepeToolbarBuildToolbar(() => copilotCallbacksRef.current),
              },
            }
          : undefined
      ) as CrepeConfig['featureConfigs']

      const flushMarkdownSnapshotToCollab = (): void => {
        if (snapshotTimerRef.current) {
          clearTimeout(snapshotTimerRef.current)
          snapshotTimerRef.current = null
        }
        if (!collab || readOnlyRef.current) {
          return
        }
        const editor = crepeRef.current
        if (!editor) {
          return
        }
        let markdown: string
        try {
          markdown = editor.getMarkdown()
          lastMarkdownRef.current = markdown
        } catch {
          markdown = lastMarkdownRef.current
        }
        collab.sendMarkdownSnapshot(markdown)
      }

      const onBeforeUnload = (): void => {
        flushMarkdownSnapshotToCollab()
      }
      window.addEventListener('beforeunload', onBeforeUnload)

      const crepe = new Crepe({
        root: mountRoot,
        defaultValue: defaultMarkdown,
        features,
        featureConfigs,
      })
      crepe.editor.use(collabPlugin)
      crepe.editor.use(
        createIssueGutterMilkdownPlugin(() => issueGutterMarksRef.current),
      )

      crepe.on((lm) => {
        lm.markdownUpdated((_ctx, markdown) => {
          lastMarkdownRef.current = markdown
          const c = collabRef.current
          if (!c || readOnlyRef.current) {
            return
          }
          if (snapshotTimerRef.current) {
            clearTimeout(snapshotTimerRef.current)
          }
          snapshotTimerRef.current = setTimeout(() => {
            snapshotTimerRef.current = null
            c.sendMarkdownSnapshot(markdown)
          }, SNAPSHOT_DEBOUNCE_MS)
        })
        lm.selectionUpdated((ctx) => {
          const fn = onSelRef.current
          if (!fn) {
            return
          }
          const view = ctx.get(editorViewCtx)
          fn(pmSelectionToEditorState(view, lastMarkdownRef.current))
        })
      })

      void (async () => {
        try {
          await crepe.create()
        } catch {
          if (!cancelled) {
            setLoading(false)
          }
          return
        }
        if (cancelled) {
          void crepe.destroy()
          return
        }
        try {
          crepe.editor.action((ctx) => {
            const api = ctx.get(CREPE_BLOCK_EDIT_MENU_API_NAME) as CrepeBlockEditMenuApi
            const origShow = api.show.bind(api)
            const origHide = api.hide.bind(api)
            api.show = (pos: number): void => {
              setCrepeBlockHandleAddMenuSession(true)
              origShow(pos)
            }
            api.hide = (): void => {
              origHide()
              setCrepeBlockHandleAddMenuSession(false)
            }
          })
        } catch {
          /* menu API missing — editor still usable */
        }
        crepeRef.current = crepe
        if (readOnly) {
          crepe.setReadonly(true)
        }
        try {
          lastMarkdownRef.current = crepe.getMarkdown()
        } catch {
          /* ignore */
        }
        // Do not tie the loading overlay to Yjs / CollabReady. `crepe.create()` already
        // mounts ProseMirror; if `ctx.wait(CollabReady)` stalls, users otherwise see
        // content behind a perpetual "Loading editor…" shell.
        setLoading(false)
        try {
          onEditorReadyRef.current?.()
        } catch {
          /* ignore host callbacks */
        }
        const bundle = collabRef.current
        if (bundle && !readOnlyRef.current) {
          try {
            await crepe.editor.action(async (ctx) => {
              await ctx.wait(CollabReady)
              if (cancelled) {
                return
              }
              const svc = ctx.get(collabServiceCtx)
              svc
                .bindDoc(bundle.ydoc)
                .setAwareness(bundle.awareness)
                .applyTemplate(defaultMarkdown)
                .connect()
            })
          } catch {
            /* collab bind is best-effort; editor remains usable */
          }
        }
        if (!cancelled) {
          try {
            onEditorReadyRef.current?.()
          } catch {
            /* ignore host callbacks */
          }
        }
      })()

      return () => {
        cancelled = true
        window.removeEventListener('beforeunload', onBeforeUnload)
        flushMarkdownSnapshotToCollab()
        cancelAnimateRef.current?.()
        cancelAnimateRef.current = null
        const c = crepeRef.current
        crepeRef.current = null
        if (c) {
          void c.editor.action(async (ctx) => {
            try {
              await ctx.wait(CollabReady)
              ctx.get(collabServiceCtx).disconnect()
            } catch {
              /* ignore */
            }
          })
          void c.destroy()
        }
        setLoading(true)
      }
    }, [defaultMarkdown, readOnly, canEdit, collab])

    useEffect(() => {
      issueGutterMarksRef.current = issueGutterMarks ?? []
      const c = crepeRef.current
      if (!c || loading) {
        return
      }
      try {
        void c.editor.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          dispatchIssueGutterRefresh(view)
        })
      } catch {
        /* editor may be destroying */
      }
    }, [issueGutterMarks, loading])

    useEffect(() => {
      blockOnboardingViewRef.current = null
      setBlockOnboardingRect(null)
      if (readOnly || loading) {
        return
      }
      if (readEditorBlockHandleFirstRunDone()) {
        return
      }
      const cancelled = { current: false }
      let rafOuter = 0
      let rafInner = 0
      let tProbeRepeat: ReturnType<typeof setTimeout> | null = null
      let tPollStart: ReturnType<typeof setTimeout> | null = null
      let pollTimer: ReturnType<typeof setTimeout> | null = null
      let tDismiss: ReturnType<typeof setTimeout> | null = null

      const clearTimers = (): void => {
        if (tProbeRepeat != null) {
          clearTimeout(tProbeRepeat)
          tProbeRepeat = null
        }
        if (tPollStart != null) {
          clearTimeout(tPollStart)
          tPollStart = null
        }
        if (pollTimer != null) {
          clearTimeout(pollTimer)
          pollTimer = null
        }
        if (tDismiss != null) {
          clearTimeout(tDismiss)
          tDismiss = null
        }
      }

      const run = (): void => {
        if (cancelled.current) {
          return
        }
        const host = outerRef.current
        const c = crepeRef.current
        if (!host || !c) {
          return
        }
        let view: EditorView | null = null
        try {
          view = c.editor.action((ctx) => ctx.get(editorViewCtx))
        } catch {
          return
        }
        if (!view || cancelled.current) {
          return
        }
        const p = findFirstParagraphEl(view)
        if (!p) {
          return
        }
        const clientX = getBlockHandleProbeClientX(view)
        const pr = p.getBoundingClientRect()
        const clientY = pr.top + pr.height / 2
        dispatchBlockHandlePointerProbe(view, clientX, clientY)
        tProbeRepeat = setTimeout(() => {
          if (cancelled.current) {
            return
          }
          dispatchBlockHandlePointerProbe(view, clientX, clientY)
        }, 260)

        let polls = 0
        const poll = (): void => {
          if (cancelled.current) {
            return
          }
          const h = queryVisibleBlockHandle(host)
          if (h) {
            blockOnboardingViewRef.current = view
            writeEditorBlockHandleFirstRunDone()
            setBlockOnboardingRect(h.getBoundingClientRect())
            tDismiss = setTimeout(() => {
              if (cancelled.current) {
                return
              }
              setBlockOnboardingRect(null)
              const v = blockOnboardingViewRef.current
              blockOnboardingViewRef.current = null
              if (v) {
                hideBlockHandleViaPointerProbe(v)
              }
            }, 3000)
            return
          }
          polls += 1
          if (polls >= 28) {
            return
          }
          pollTimer = setTimeout(poll, 80)
        }
        tPollStart = setTimeout(poll, 50)
      }

      rafOuter = requestAnimationFrame(() => {
        rafInner = requestAnimationFrame(run)
      })

      return () => {
        cancelled.current = true
        cancelAnimationFrame(rafOuter)
        cancelAnimationFrame(rafInner)
        clearTimers()
        setBlockOnboardingRect(null)
        const v = blockOnboardingViewRef.current
        blockOnboardingViewRef.current = null
        if (v) {
          hideBlockHandleViaPointerProbe(v)
        }
      }
    }, [readOnly, loading])

    return (
      <div
        ref={outerRef}
        data-testid="crepe-host"
        className="crepe-atelier-host relative h-full min-h-[200px] w-full min-w-0 bg-zinc-950 text-zinc-100"
      >
        <div
          ref={crepeRootRef}
          className="h-full min-h-[200px] w-full min-w-0 [&_.milkdown]:min-h-[200px]"
        />
        {blockOnboardingRect ? (
          <EditorBlockHandleOnboardingTooltip anchorRect={blockOnboardingRect} />
        ) : null}
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start bg-zinc-950">
            <p className="p-3 text-xs text-zinc-500">Loading editor…</p>
          </div>
        ) : null}
      </div>
    )
  },
)

CrepeEditorInner.displayName = 'CrepeEditorInner'

export const CrepeEditor = forwardRef<CrepeEditorApi, CrepeEditorProps>(
  function CrepeEditor(props, ref): ReactElement {
    return (
      <AiComposerPrefillProvider
        value={{
          onAiComposerPrefill: props.onAiComposerPrefill,
          onExecuteCopilotSlash: props.onCopilotSlashExecute,
          replaceSelectionDisabled: props.replaceSelectionSlashDisabled,
        }}
      >
        <CrepeEditorInner {...props} ref={ref} />
      </AiComposerPrefillProvider>
    )
  },
)

CrepeEditor.displayName = 'CrepeEditor'
