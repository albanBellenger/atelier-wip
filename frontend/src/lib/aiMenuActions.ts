import {
  parseThreadComposerInput,
  type ParsedComposerInput,
} from './threadSlashCommand'

export type AiMenuExecutionMode = 'prefill' | 'execute'

export interface AiMenuItemMeta {
  executionMode: AiMenuExecutionMode
  /**
   * Default instruction body for execute mode (mirrors `threadSlashCommand` fallbacks).
   * `null` means the parser / API default (e.g. `/improve` with no trailing text).
   */
  defaultContent: string | null
}

const MENU_ID_TO_PREFIX: Record<string, string> = {
  append: '/append ',
  replace: '/replace ',
  edit: '/edit ',
  ask: '/ask ',
  improve: '/improve ',
  critique: '/critique ',
}

const MENU_META: Record<string, AiMenuItemMeta> = {
  append: {
    executionMode: 'execute',
    defaultContent: 'Append helpful content to the end of this section.',
  },
  replace: { executionMode: 'prefill', defaultContent: null },
  edit: { executionMode: 'prefill', defaultContent: null },
  ask: { executionMode: 'prefill', defaultContent: null },
  improve: { executionMode: 'execute', defaultContent: null },
  critique: {
    executionMode: 'execute',
    defaultContent: 'Critique this section for gaps and risks.',
  },
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

export function aiMenuItemMeta(menuId: string): AiMenuItemMeta | undefined {
  return MENU_META[menuId]
}

export function executionModeForAiMenuItem(menuId: string): AiMenuExecutionMode {
  return MENU_META[menuId]?.executionMode ?? 'prefill'
}

/** Minimal composer line that triggers the same server path as Send for execute items. */
export function composerRawLineForMenuExecute(menuId: string): string | null {
  if (executionModeForAiMenuItem(menuId) !== 'execute') {
    return null
  }
  const prefix = MENU_ID_TO_PREFIX[menuId]?.trimEnd()
  return prefix != null ? prefix : null
}

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
