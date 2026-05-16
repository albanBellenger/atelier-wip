import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  clearTextInCurrentBlockCommand,
  emphasisSchema,
  headingSchema,
  inlineCodeSchema,
  isMarkSelectedCommand,
  linkSchema,
  paragraphSchema,
  setBlockTypeCommand,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { strikethroughSchema, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import {
  boldIcon,
  codeIcon,
  editIcon,
  grammarCheckIcon,
  h1Icon,
  h2Icon,
  h3Icon,
  italicIcon,
  linkIcon,
  plusIcon,
  strikethroughIcon,
  textIcon,
} from '../../../node_modules/@milkdown/crepe/src/icons/index.ts'

import {
  composerPrefixForAiMenuItem,
  composerRawLineForMenuExecute,
  executionModeForAiMenuItem,
  parsedInputForAiMenuItem,
} from '../../lib/aiMenuActions'
import type { CrepeCopilotMenuCallbacks } from './crepeCopilotMenus'

export type CrepeToolbarGroupBuilder = {
  clear: () => CrepeToolbarGroupBuilder
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

/** Bubble toolbar: primary Copilot actions (others stay on `/` slash menu). */
const TOOLBAR_COPILOT_IDS = ['replace', 'improve', 'append'] as const

const COPILOT_TOOLBAR_ICONS: Record<(typeof TOOLBAR_COPILOT_IDS)[number], string> = {
  replace: editIcon,
  improve: grammarCheckIcon,
  append: plusIcon,
}

function blockParent(ctx: Ctx): { name: string; attrs: Record<string, unknown> } {
  const view = ctx.get(editorViewCtx)
  const parent = view.state.selection.$from.parent
  return { name: parent.type.name, attrs: parent.attrs as Record<string, unknown> }
}

function isParagraphActive(ctx: Ctx): boolean {
  const { name } = blockParent(ctx)
  return name === 'paragraph'
}

function isHeadingLevelActive(ctx: Ctx, level: number): boolean {
  const { name, attrs } = blockParent(ctx)
  return name === 'heading' && attrs.level === level
}

function setBlockToParagraphOrHeading(ctx: Ctx, level: number | null): void {
  const commands = ctx.get(commandsCtx)
  commands.call(clearTextInCurrentBlockCommand.key)
  if (level === null) {
    const paragraph = paragraphSchema.type(ctx)
    commands.call(setBlockTypeCommand.key, {
      nodeType: paragraph,
    })
    return
  }
  const heading = headingSchema.type(ctx)
  commands.call(setBlockTypeCommand.key, {
    nodeType: heading,
    attrs: { level },
  })
}

/**
 * Replaces Crepe’s default bubble toolbar with a shorter grouped layout:
 * Block (paragraph + H1–H3) | Style | Insert | Copilot (3 actions; full set remains in slash `/`).
 */
export function crepeToolbarBuildAtelier(
  getCallbacks: () => CrepeCopilotMenuCallbacks,
): (builder: unknown) => void {
  return (builder): void => {
    const b = builder as CrepeToolbarGroupBuilder
    b.clear()

    const block = b.addGroup('atelier-block', 'Block')
    block.addItem('atelier-block-text', {
      icon: textIcon,
      active: (ctx) => isParagraphActive(ctx),
      onRun: (ctx) => setBlockToParagraphOrHeading(ctx, null),
    })
    for (const level of [1, 2, 3] as const) {
      block.addItem(`atelier-block-h${level}`, {
        icon: level === 1 ? h1Icon : level === 2 ? h2Icon : h3Icon,
        active: (ctx) => isHeadingLevelActive(ctx, level),
        onRun: (ctx) => setBlockToParagraphOrHeading(ctx, level),
      })
    }

    const style = b.addGroup('atelier-style', 'Style')
    style.addItem('atelier-style-bold', {
      icon: boldIcon,
      active: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return commands.call(isMarkSelectedCommand.key, strongSchema.type(ctx))
      },
      onRun: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(toggleStrongCommand.key)
      },
    })
    style.addItem('atelier-style-italic', {
      icon: italicIcon,
      active: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return commands.call(isMarkSelectedCommand.key, emphasisSchema.type(ctx))
      },
      onRun: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(toggleEmphasisCommand.key)
      },
    })
    style.addItem('atelier-style-strike', {
      icon: strikethroughIcon,
      active: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return commands.call(isMarkSelectedCommand.key, strikethroughSchema.type(ctx))
      },
      onRun: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(toggleStrikethroughCommand.key)
      },
    })

    const insert = b.addGroup('atelier-insert', 'Insert')
    insert.addItem('atelier-insert-code', {
      icon: codeIcon,
      active: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return commands.call(isMarkSelectedCommand.key, inlineCodeSchema.type(ctx))
      },
      onRun: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(toggleInlineCodeCommand.key)
      },
    })
    insert.addItem('atelier-insert-link', {
      icon: linkIcon,
      active: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return commands.call(isMarkSelectedCommand.key, linkSchema.type(ctx))
      },
      onRun: (ctx) => {
        const commands = ctx.get(commandsCtx)
        commands.call(toggleLinkCommand.key)
      },
    })

    const copilot = b.addGroup('atelier-copilot', 'Copilot')
    for (const id of TOOLBAR_COPILOT_IDS) {
      copilot.addItem(`atelier-copilot-${id}`, {
        icon: COPILOT_TOOLBAR_ICONS[id],
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
