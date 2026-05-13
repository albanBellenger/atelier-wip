import { commandsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  createCodeBlockCommand,
  insertHrCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'

export interface SlashBlockMenuItem {
  id: string
  label: string
  /** Run after slash trigger text is removed from the document. */
  run: (ctx: Ctx) => void
}

function callHeading(level: 1 | 2 | 3): (ctx: Ctx) => void {
  return (ctx: Ctx): void => {
    void ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level)
  }
}

/** Block-insertion entries for the Milkdown slash menu (ordered). */
export const BLOCK_MENU_ITEMS: readonly SlashBlockMenuItem[] = [
  { id: 'h1', label: 'Heading 1', run: callHeading(1) },
  { id: 'h2', label: 'Heading 2', run: callHeading(2) },
  { id: 'h3', label: 'Heading 3', run: callHeading(3) },
  {
    id: 'bullet_list',
    label: 'Bullet list',
    run: (ctx: Ctx): void => {
      void ctx.get(commandsCtx).call(wrapInBulletListCommand.key)
    },
  },
  {
    id: 'ordered_list',
    label: 'Ordered list',
    run: (ctx: Ctx): void => {
      void ctx.get(commandsCtx).call(wrapInOrderedListCommand.key)
    },
  },
  {
    id: 'code_block',
    label: 'Code block',
    run: (ctx: Ctx): void => {
      void ctx.get(commandsCtx).call(createCodeBlockCommand.key)
    },
  },
  {
    id: 'quote',
    label: 'Quote',
    run: (ctx: Ctx): void => {
      void ctx.get(commandsCtx).call(wrapInBlockquoteCommand.key)
    },
  },
  {
    id: 'hr',
    label: 'Horizontal rule',
    run: (ctx: Ctx): void => {
      void ctx.get(commandsCtx).call(insertHrCommand.key)
    },
  },
]
