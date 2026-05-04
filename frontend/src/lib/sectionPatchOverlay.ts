/** Inline preview + actions for a pending LLM patch (SplitEditor preview pane). */
export type SectionPatchOverlayState = {
  mergedMarkdown: string
  canApply: boolean
  blockedReason: string | null
  onApply: () => void
  onDismiss: () => void
}
