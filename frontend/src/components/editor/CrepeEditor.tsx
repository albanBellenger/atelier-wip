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

import type { YjsCollab } from '../../hooks/useYjsCollab'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import {
  applyPatchToEditor,
  type PatchAnchor,
  type PatchProposalMeta,
} from '../../lib/sectionPatchApply'
import { startAnimateAppendMarkdown } from '../../lib/sectionStreamApply'
import { AiComposerPrefillProvider } from './aiComposerPrefillContext'
import {
  crepeBlockEditBuildMenu,
  crepeToolbarBuildToolbar,
  type CrepeCopilotMenuCallbacks,
} from './crepeCopilotMenus'
import type { EditorSelectionState } from './editorSelection'

import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame-dark.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'

const SNAPSHOT_DEBOUNCE_MS = 2000

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
  onSelectionChange?: (sel: EditorSelectionState | null) => void
  patchOverlay?: SectionPatchOverlayState | null
  onAiComposerPrefill?: (markdown: string) => void
  onCopilotSlashExecute?: (rawComposerLine: string) => void | Promise<void>
  replaceSelectionSlashDisabled?: boolean
}

function pmSelectionToEditorState(
  view: EditorView,
  snapshotMarkdown: string,
): EditorSelectionState | null {
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
      onSelectionChange,
      patchOverlay: _patchOverlay,
      onAiComposerPrefill,
      onCopilotSlashExecute,
      replaceSelectionSlashDisabled = false,
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

    const [loading, setLoading] = useState(true)

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
        getMarkdown: (): string => lastMarkdownRef.current,
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
                buildToolbar: crepeToolbarBuildToolbar(() => copilotCallbacksRef.current),
              },
            }
          : undefined
      ) as CrepeConfig['featureConfigs']

      const crepe = new Crepe({
        root: mountRoot,
        defaultValue: defaultMarkdown,
        features,
        featureConfigs,
      })
      crepe.editor.use(collabPlugin)

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
        crepeRef.current = crepe
        if (readOnly) {
          crepe.setReadonly(true)
        }
        try {
          lastMarkdownRef.current = crepe.getMarkdown()
        } catch {
          /* ignore */
        }
        const bundle = collabRef.current
        if (bundle && !readOnlyRef.current) {
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
        }
        setLoading(false)
      })()

      return () => {
        cancelled = true
        if (snapshotTimerRef.current) {
          clearTimeout(snapshotTimerRef.current)
          snapshotTimerRef.current = null
        }
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
