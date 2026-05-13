import {
  parseThreadComposerInput,
  type ParsedComposerInput,
} from './threadSlashCommand'

/** Slash / bubble menu ids → composer-equivalent slash input. */
const MENU_ID_TO_PREFIX: Record<string, string> = {
  append: '/append ',
  replace: '/replace ',
  edit: '/edit ',
  ask: '/ask ',
  improve: '/improve ',
  critique: '/critique ',
}

/** Ordered ids for editor slash / bubble menus (stable UX + tests). */
export const AI_MENU_ITEM_IDS: readonly string[] = [
  'append',
  'replace',
  'edit',
  'ask',
  'improve',
  'critique',
]

export function composerPrefixForAiMenuItem(menuId: string): string | null {
  const prefix = MENU_ID_TO_PREFIX[menuId]
  return prefix != null ? prefix : null
}

export function parsedInputForAiMenuItem(menuId: string): ParsedComposerInput | null {
  const prefix = MENU_ID_TO_PREFIX[menuId]
  if (prefix == null) {
    return null
  }
  return parseThreadComposerInput(prefix.trimEnd())
}
