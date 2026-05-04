/** React Router `location.state` key: home composer → software chat auto-send. */
export const SOFTWARE_COMPOSER_DRAFT_STATE_KEY = 'softwareComposerDraft' as const

export type SoftwareComposerLocationState = {
  [SOFTWARE_COMPOSER_DRAFT_STATE_KEY]?: string
}
