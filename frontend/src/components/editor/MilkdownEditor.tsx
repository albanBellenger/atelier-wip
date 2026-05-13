import { collab as collabPlugin, collabServiceCtx, CollabReady } from '@milkdown/plugin-collab'
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorStateOptionsCtx,
  parserCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { block } from '@milkdown/kit/plugin/block'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import type { EditorView } from '@milkdown/prose/view'
import { ProsemirrorAdapterProvider, usePluginViewFactory } from '@prosemirror-adapter/react'
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  forwardRef,
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
import type { EditorSelectionState } from './editorSelection'
import { atelierSlash, SlashMenuView } from './SlashMenuView'
import { atelierTooltip, BubbleMenuView } from './BubbleMenuView'

import '@milkdown/kit/prose/view/style/prosemirror.css'

const SNAPSHOT_DEBOUNCE_MS = 2000

export interface MilkdownEditorApi {
  getEditorView: () => EditorView | null
  getMarkdown: () => string
  /** Replace entire document body (e.g. backprop / doc-sync insert). */
  replaceFullMarkdown: (markdown: string) => void
  applyPatch: (
    proposal: PatchProposalMeta,
    anchor: PatchAnchor,
  ) => { ok: true } | { ok: false; reason: string }
  /**
   * RAF-chunked append after SSE meta (append intent). Resolves when animation finishes.
   */
  animateAppendFromMarkdown: (markdown: string) => Promise<void>
}

export interface MilkdownEditorProps {
  collab: YjsCollab | null
  /** Seed from REST `section.content` when Yjs fragment is empty. */
  defaultMarkdown: string
  /** When true, editor is display-only (no AI menus, no collab connect). */
  readOnly?: boolean
  onSelectionChange?: (sel: EditorSelectionState | null) => void
  patchOverlay?: SectionPatchOverlayState | null
  /** Prefill section copilot composer from slash / bubble AI entries. */
  onAiComposerPrefill?: (markdown: string) => void
  /** When true, /replace is disabled in the selection bubble (focus layout). */
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

/** Must render under `MilkdownProvider` — `useEditor` registers with provider context. */
const MilkdownEditorInner = forwardRef<MilkdownEditorApi, MilkdownEditorProps>(
  function MilkdownEditorInner(
    {
      collab,
      defaultMarkdown,
      readOnly = false,
      onSelectionChange,
      patchOverlay: _patchOverlay,
    },
    ref,
  ): ReactElement {
    const canEdit = !readOnly
    const lastMarkdownRef = useRef<string>(defaultMarkdown)
    const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const onSelRef = useRef(onSelectionChange)
    onSelRef.current = onSelectionChange
    const readOnlyRef = useRef(readOnly)
    readOnlyRef.current = readOnly
    const collabRef = useRef<YjsCollab | null>(collab)
    collabRef.current = collab
    const cancelAnimateRef = useRef<(() => void) | null>(null)

    const pluginViewFactory = usePluginViewFactory()

    const { loading, get } = useEditor(
      (root) => {
        const editor = Editor.make()
          .config((ctx) => {
            ctx.update(rootCtx, () => root)
            ctx.set(defaultValueCtx, defaultMarkdown)
            ctx.update(editorStateOptionsCtx, (prevOverride) => (baseOptions) => ({
              ...prevOverride(baseOptions),
              editable: () => !readOnlyRef.current,
            }))
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, _prev) => {
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
            ctx.get(listenerCtx).selectionUpdated((ctx) => {
              const fn = onSelRef.current
              if (!fn) {
                return
              }
              const view = ctx.get(editorViewCtx)
              fn(pmSelectionToEditorState(view, lastMarkdownRef.current))
            })
            if (canEdit) {
              ctx.set(atelierSlash.key, {
                view: pluginViewFactory({
                  component: SlashMenuView,
                }),
              })
              ctx.set(atelierTooltip.key, {
                view: pluginViewFactory({
                  component: BubbleMenuView,
                }),
              })
            }
          })
          .use(commonmark)
          .use(gfm)
          .use(history)
          .use(listener)
          .use(collabPlugin)
          .use(block)
        if (canEdit) {
          void editor.use(atelierSlash[0]).use(atelierSlash[1])
          void editor.use(atelierTooltip[0]).use(atelierTooltip[1])
        }

        return editor
      },
      [defaultMarkdown, pluginViewFactory, canEdit],
    )

    useImperativeHandle(
      ref,
      () => ({
        getEditorView: (): EditorView | null => {
          const ed = get()
          if (!ed) {
            return null
          }
          return ed.action((ctx) => ctx.get(editorViewCtx))
        },
        getMarkdown: (): string => lastMarkdownRef.current,
        replaceFullMarkdown: (markdown: string): void => {
          const ed = get()
          if (!ed) {
            return
          }
          lastMarkdownRef.current = markdown
          void ed.action((ctx) => {
            const svc = ctx.get(collabServiceCtx)
            svc.applyTemplate(markdown, () => true)
          })
        },
        applyPatch: (
          proposal: PatchProposalMeta,
          anchor: PatchAnchor,
        ): { ok: true } | { ok: false; reason: string } => {
          const ed = get()
          if (!ed) {
            return { ok: false, reason: 'Editor not ready.' }
          }
          return ed.action((ctx) => {
            const view = ctx.get(editorViewCtx)
            const parser = ctx.get(parserCtx)
            const serializer = ctx.get(serializerCtx)
            return applyPatchToEditor(view, parser, serializer, proposal, anchor)
          })
        },
        animateAppendFromMarkdown: (markdown: string): Promise<void> => {
          const ed = get()
          if (!ed) {
            return Promise.resolve()
          }
          cancelAnimateRef.current?.()
          return new Promise((resolve) => {
            void ed.action((ctx) => {
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
      [get],
    )

    useEffect(() => {
      const ed = get()
      if (!ed || !collab || readOnly) {
        return
      }
      let cancelled = false
      void ed.action(async (ctx) => {
        await ctx.wait(CollabReady)
        if (cancelled) {
          return
        }
        const svc = ctx.get(collabServiceCtx)
        svc
          .bindDoc(collab.ydoc)
          .setAwareness(collab.awareness)
          .applyTemplate(defaultMarkdown)
          .connect()
      })
      return () => {
        cancelled = true
        void ed.action(async (ctx) => {
          try {
            await ctx.wait(CollabReady)
            ctx.get(collabServiceCtx).disconnect()
          } catch {
            /* ignore */
          }
        })
      }
    }, [get, collab, defaultMarkdown, readOnly])

    useEffect(() => {
      return () => {
        if (snapshotTimerRef.current) {
          clearTimeout(snapshotTimerRef.current)
        }
        cancelAnimateRef.current?.()
        cancelAnimateRef.current = null
      }
    }, [])

    // `<Milkdown />` must stay mounted while `loading` is true: `@milkdown/react`'s
    // `useGetEditor` only runs inside `<Milkdown />` and is what drives
    // `editor.create()` and clears provider `loading`. Conditional rendering here
    // caused a deadlock (permanent "Loading editor…").
    const inner = useMemo(
      () => (
        <div className="relative h-full min-h-[200px] w-full min-w-0 bg-zinc-950 text-zinc-100">
          <Milkdown />
          {loading ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start bg-zinc-950">
              <p className="p-3 text-xs text-zinc-500">Loading editor…</p>
            </div>
          ) : null}
        </div>
      ),
      [loading],
    )

    return inner
  },
)

MilkdownEditorInner.displayName = 'MilkdownEditorInner'

export const MilkdownEditor = forwardRef<MilkdownEditorApi, MilkdownEditorProps>(
  function MilkdownEditor(props, ref): ReactElement {
    return (
      <ProsemirrorAdapterProvider>
        <MilkdownProvider>
          <AiComposerPrefillProvider
            value={{
              onAiComposerPrefill: props.onAiComposerPrefill,
              replaceSelectionDisabled: props.replaceSelectionSlashDisabled,
            }}
          >
            <MilkdownEditorInner {...props} ref={ref} />
          </AiComposerPrefillProvider>
        </MilkdownProvider>
      </ProsemirrorAdapterProvider>
    )
  },
)

MilkdownEditor.displayName = 'MilkdownEditor'
