import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'

import {
  AI_MENU_ITEM_IDS,
  composerPrefixForAiMenuItem,
  composerRawLineForMenuExecute,
  executionModeForAiMenuItem,
  parsedInputForAiMenuItem,
} from '../../lib/aiMenuActions'
import { deleteSlashInputRange } from './slashInputDelete'

/** Minimal SVG icon for Crepe slash / toolbar rows (Crepe expects HTML string icons). */
export const ATELIER_MENU_DOT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="atelier-copilot-menu-icon"><circle cx="12" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="16" r="2"/></svg>`

const SLASH_AI_LABELS: Record<string, string> = {
  append: 'Copilot: append',
  replace: 'Copilot: replace selection',
  edit: 'Copilot: edit (snippet)',
  ask: 'Copilot: ask',
  improve: 'Copilot: improve',
  critique: 'Copilot: critique',
}

export interface CrepeCopilotMenuCallbacks {
  onAiComposerPrefill?: (markdown: string) => void
  onCopilotSlashExecute?: (rawComposerLine: string) => void | Promise<void>
  replaceSelectionDisabled?: boolean
}

export function crepeBlockEditBuildMenu(
  getCallbacks: () => CrepeCopilotMenuCallbacks,
): (builder: unknown) => void {
  return (builder): void => {
    const b = builder as {
      addGroup: (
        key: string,
        label: string,
      ) => {
        addItem: (
          key: string,
          item: {
            label: string
            icon: string
            onRun?: (ctx: Ctx) => void
          },
        ) => unknown
      }
    }
    const g = b.addGroup('atelier-copilot', 'Copilot')
    for (const id of AI_MENU_ITEM_IDS) {
      g.addItem(`atelier-ai-${id}`, {
        label: SLASH_AI_LABELS[id] ?? id,
        icon: ATELIER_MENU_DOT_ICON,
        onRun: (ctx: Ctx): void => {
          const view = ctx.get(editorViewCtx)
          if (parsedInputForAiMenuItem(id) == null) {
            return
          }
          const execRaw = composerRawLineForMenuExecute(id)
          const { onAiComposerPrefill, onCopilotSlashExecute } = getCallbacks()
          if (executionModeForAiMenuItem(id) === 'execute' && execRaw != null) {
            deleteSlashInputRange(view)
            void onCopilotSlashExecute?.(execRaw)
            return
          }
          const prefix = composerPrefixForAiMenuItem(id)
          if (prefix == null) {
            return
          }
          deleteSlashInputRange(view)
          onAiComposerPrefill?.(prefix)
        },
      })
    }
  }
}

const BUBBLE_IDS = ['replace', 'edit', 'improve', 'append', 'ask', 'critique'] as const

export function crepeToolbarBuildToolbar(
  getCallbacks: () => CrepeCopilotMenuCallbacks,
): (builder: unknown) => void {
  return (builder): void => {
    const b = builder as {
      addGroup: (
        key: string,
        label: string,
      ) => {
        addItem: (
          key: string,
          item: {
            icon: string
            active: (ctx: Ctx) => boolean
            onRun?: (ctx: Ctx) => void
          },
        ) => unknown
      }
    }
    const g = b.addGroup('atelier-copilot', 'Copilot')
    for (const id of BUBBLE_IDS) {
      g.addItem(`atelier-bubble-${id}`, {
        icon: ATELIER_MENU_DOT_ICON,
        active: () => false,
        onRun: (ctx: Ctx): void => {
          const { replaceSelectionDisabled, onAiComposerPrefill, onCopilotSlashExecute } =
            getCallbacks()
          if (id === 'replace' && replaceSelectionDisabled) {
            return
          }
          if (parsedInputForAiMenuItem(id) == null) {
            return
          }
          const view = ctx.get(editorViewCtx)
          const execRaw = composerRawLineForMenuExecute(id)
          if (executionModeForAiMenuItem(id) === 'execute' && execRaw != null) {
            view.focus()
            void onCopilotSlashExecute?.(execRaw)
            return
          }
          const prefix = composerPrefixForAiMenuItem(id)
          if (prefix == null) {
            return
          }
          view.focus()
          onAiComposerPrefill?.(prefix)
        },
      })
    }
  }
}
