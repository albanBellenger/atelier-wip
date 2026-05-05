/** React Router `location.state` key: home composer → software chat auto-send. */
export const SOFTWARE_COMPOSER_DRAFT_STATE_KEY = 'softwareComposerDraft' as const

/** Optional chat model id (must match GET /studios/{id}/llm-chat-models allow-list). */
export const SOFTWARE_COMPOSER_CHAT_MODEL_KEY = 'softwareComposerChatModel' as const

export type SoftwareComposerLocationState = {
  [SOFTWARE_COMPOSER_DRAFT_STATE_KEY]?: string
  [SOFTWARE_COMPOSER_CHAT_MODEL_KEY]?: string
}

const SOFTWARE_CHAT_MODEL_STORAGE_PREFIX = 'atelier.softwareChatChatModel.' as const

export function softwareChatModelStorageKey(studioId: string): string {
  return `${SOFTWARE_CHAT_MODEL_STORAGE_PREFIX}${studioId}`
}

/** Persisted home/chat preference: allowed studio chat model id. */
export function readStoredSoftwareChatModel(studioId: string): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(softwareChatModelStorageKey(studioId))
  const t = raw?.trim()
  return t || null
}
