import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  bulletListSchema,
  clearTextInCurrentBlockCommand,
  codeBlockSchema,
  headingSchema,
  paragraphSchema,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  bulletListIcon,
  codeIcon,
  h2Icon,
  textIcon,
} from '../../../node_modules/@milkdown/crepe/src/icons/index.ts'

import {
  AI_MENU_ITEM_IDS,
  composerPrefixForAiMenuItem,
  composerRawLineForMenuExecute,
  executionModeForAiMenuItem,
  parsedInputForAiMenuItem,
} from '../../lib/aiMenuActions'
import { isCrepeBlockHandleAddMenuSession } from './crepeBlockAddMenuScope'
import { deleteSlashInputRange } from './slashInputDelete'

/**
 * Minimal SVG for Crepe slash / toolbar (HTML string icons).
 * Use `<rect>` not `<circle>`: Crepe’s `Icon` runs `DOMPurify.sanitize()` on `innerHTML`, which
 * strips `<circle>` by default, leaving an empty `<svg>` in the bubble toolbar.
 */
export const ATELIER_MENU_DOT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="atelier-copilot-menu-icon"><rect x="10" y="6" width="4" height="4" rx="2"/><rect x="10" y="10" width="4" height="4" rx="2"/><rect x="10" y="14" width="4" height="4" rx="2"/></svg>`

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

type BlockEditMenuBuilder = {
  clear: () => unknown
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

const APPEND_MENU_ID = 'append'

function appendSlashCopilotGroup(
  b: BlockEditMenuBuilder,
  getCallbacks: () => CrepeCopilotMenuCallbacks,
): void {
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

/** Block-handle “+” menu: short list (slash `/` keeps the full default + Copilot groups). */
function appendBlockHandleQuickInsertGroup(
  b: BlockEditMenuBuilder,
  getCallbacks: () => CrepeCopilotMenuCallbacks,
): void {
  const g = b.addGroup('atelier-quick-insert', 'Insert')
  g.addItem('atelier-quick-text', {
    label: 'Paragraph',
    icon: textIcon,
    onRun: (ctx: Ctx): void => {
      const commands = ctx.get(commandsCtx)
      const paragraph = paragraphSchema.type(ctx)
      commands.call(clearTextInCurrentBlockCommand.key)
      commands.call(setBlockTypeCommand.key, {
        nodeType: paragraph,
      })
    },
  })
  g.addItem('atelier-quick-h2', {
    label: 'Heading 2',
    icon: h2Icon,
    onRun: (ctx: Ctx): void => {
      const commands = ctx.get(commandsCtx)
      const heading = headingSchema.type(ctx)
      commands.call(clearTextInCurrentBlockCommand.key)
      commands.call(setBlockTypeCommand.key, {
        nodeType: heading,
        attrs: {
          level: 2,
        },
      })
    },
  })
  g.addItem('atelier-quick-bullet', {
    label: 'Bullet list',
    icon: bulletListIcon,
    onRun: (ctx: Ctx): void => {
      const commands = ctx.get(commandsCtx)
      const bulletList = bulletListSchema.type(ctx)
      commands.call(clearTextInCurrentBlockCommand.key)
      commands.call(wrapInBlockTypeCommand.key, {
        nodeType: bulletList,
      })
    },
  })
  g.addItem('atelier-quick-code', {
    label: 'Code block',
    icon: codeIcon,
    onRun: (ctx: Ctx): void => {
      const commands = ctx.get(commandsCtx)
      const codeBlock = codeBlockSchema.type(ctx)
      commands.call(clearTextInCurrentBlockCommand.key)
      commands.call(setBlockTypeCommand.key, {
        nodeType: codeBlock,
      })
    },
  })
  g.addItem(`atelier-ai-${APPEND_MENU_ID}`, {
    label: SLASH_AI_LABELS[APPEND_MENU_ID] ?? APPEND_MENU_ID,
    icon: ATELIER_MENU_DOT_ICON,
    onRun: (ctx: Ctx): void => {
      const view = ctx.get(editorViewCtx)
      if (parsedInputForAiMenuItem(APPEND_MENU_ID) == null) {
        return
      }
      const execRaw = composerRawLineForMenuExecute(APPEND_MENU_ID)
      const { onCopilotSlashExecute } = getCallbacks()
      if (executionModeForAiMenuItem(APPEND_MENU_ID) === 'execute' && execRaw != null) {
        deleteSlashInputRange(view)
        void onCopilotSlashExecute?.(execRaw)
      }
    },
  })
}

export function crepeBlockEditBuildMenu(
  getCallbacks: () => CrepeCopilotMenuCallbacks,
): (builder: unknown) => void {
  return (builder): void => {
    const b = builder as BlockEditMenuBuilder
    if (isCrepeBlockHandleAddMenuSession()) {
      b.clear()
      appendBlockHandleQuickInsertGroup(b, getCallbacks)
      return
    }
    appendSlashCopilotGroup(b, getCallbacks)
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
