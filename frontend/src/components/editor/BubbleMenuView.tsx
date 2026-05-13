import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { tooltipFactory, TooltipProvider } from '@milkdown/kit/plugin/tooltip'
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
  composerPrefixForAiMenuItem,
  composerRawLineForMenuExecute,
  executionModeForAiMenuItem,
  parsedInputForAiMenuItem,
} from '../../lib/aiMenuActions'
import { useAiComposerPrefill } from './aiComposerPrefillContext'

export const atelierTooltip = tooltipFactory('atelier-tooltip')

const BUBBLE_IDS = ['replace', 'edit', 'improve', 'append', 'ask', 'critique'] as const

const BUBBLE_LABELS: Record<(typeof BUBBLE_IDS)[number], string> = {
  replace: 'Replace…',
  edit: 'Edit…',
  improve: 'Improve…',
  append: 'Append…',
  ask: 'Ask…',
  critique: 'Critique…',
}

/** Selection bubble: AI actions → copilot composer. */
export function BubbleMenuView(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const providerRef = useRef<TooltipProvider | null>(null)
  const { view, prevState } = usePluginViewContext()
  const [loading, get] = useInstance()
  const {
    onAiComposerPrefill,
    onExecuteCopilotSlash,
    replaceSelectionDisabled,
  } = useAiComposerPrefill()

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
    providerRef.current = new TooltipProvider({ content: div })
    return () => {
      providerRef.current?.destroy()
      providerRef.current = null
    }
  }, [loading])

  useEffect(() => {
    providerRef.current?.update(view, prevState)
  })

  const onPick =
    (id: (typeof BUBBLE_IDS)[number]) =>
    (e: MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (id === 'replace' && replaceSelectionDisabled) {
        return
      }
      if (parsedInputForAiMenuItem(id) == null) {
        return
      }
      const execRaw = composerRawLineForMenuExecute(id)
      if (executionModeForAiMenuItem(id) === 'execute' && execRaw != null) {
        runAction((ctx) => {
          ctx.get(editorViewCtx).focus()
        })
        void onExecuteCopilotSlash?.(execRaw)
        return
      }
      const prefix = composerPrefixForAiMenuItem(id)
      if (prefix == null) {
        return
      }
      runAction((ctx) => {
        ctx.get(editorViewCtx).focus()
      })
      onAiComposerPrefill?.(prefix)
    }

  return (
    <div
      ref={hostRef}
      className="fixed z-[100] hidden flex-wrap gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-xs shadow-xl data-[show=true]:flex"
      role="toolbar"
      aria-label="Selection AI actions"
    >
      {BUBBLE_IDS.map((id) => {
        const disabled = id === 'replace' && replaceSelectionDisabled
        return (
          <button
            key={id}
            type="button"
            data-testid={`editor-bubble-ai-${id}`}
            disabled={disabled}
            title={
              disabled
                ? 'Switch to split layout to use replace with a selection.'
                : undefined
            }
            className="rounded px-2 py-1 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            onMouseDown={onPick(id)}
          >
            {BUBBLE_LABELS[id]}
          </button>
        )
      })}
    </div>
  )
}
