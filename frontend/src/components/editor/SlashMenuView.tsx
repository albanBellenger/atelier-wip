import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { slashFactory, SlashProvider } from '@milkdown/kit/plugin/slash'
import { useInstance } from '@milkdown/react'
import { usePluginViewContext } from '@prosemirror-adapter/react'
import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type ReactElement,
} from 'react'

import {
  AI_MENU_ITEM_IDS,
  composerPrefixForAiMenuItem,
  parsedInputForAiMenuItem,
} from '../../lib/aiMenuActions'
import { useAiComposerPrefill } from './aiComposerPrefillContext'
import { deleteSlashInputRange } from './slashInputDelete'

export const atelierSlash = slashFactory('atelier-slash')

const AI_LABELS: Record<string, string> = {
  append: 'Copilot: append',
  replace: 'Copilot: replace selection',
  edit: 'Copilot: edit (snippet)',
  ask: 'Copilot: ask',
  improve: 'Copilot: improve',
  critique: 'Copilot: critique',
}

/** Milkdown slash menu (AI → copilot composer). Wired via `atelierSlash` plugin. */
export function SlashMenuView(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const providerRef = useRef<SlashProvider | null>(null)
  const { view, prevState } = usePluginViewContext()
  const [loading, get] = useInstance()
  const { onAiComposerPrefill } = useAiComposerPrefill()

  const runAction = useCallback(
    (fn: (ctx: Ctx) => void) => {
      if (loading) {
        return
      }
      void get().action(fn)
    },
    [loading, get],
  )

  useEffect(() => {
    const div = hostRef.current
    if (loading || div == null) {
      return
    }
    providerRef.current = new SlashProvider({ content: div })
    return () => {
      providerRef.current?.destroy()
      providerRef.current = null
    }
  }, [loading])

  useEffect(() => {
    providerRef.current?.update(view, prevState)
  })

  const onPickAi =
    (id: string) =>
    (e: MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (parsedInputForAiMenuItem(id) == null) {
        return
      }
      const prefix = composerPrefixForAiMenuItem(id)
      if (prefix == null) {
        return
      }
      runAction((ctx) => {
        deleteSlashInputRange(ctx.get(editorViewCtx))
      })
      onAiComposerPrefill?.(prefix)
    }

  return (
    <div
      ref={hostRef}
      className="fixed z-[100] hidden min-w-[220px] flex-col gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-left text-xs shadow-xl data-[show=true]:flex"
      role="listbox"
      aria-label="Slash commands"
    >
      {AI_MENU_ITEM_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="option"
          data-testid={`editor-slash-ai-${id}`}
          className="rounded px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
          onMouseDown={onPickAi(id)}
        >
          {AI_LABELS[id] ?? id}
        </button>
      ))}
    </div>
  )
}
