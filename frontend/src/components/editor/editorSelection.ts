/** ProseMirror selection reported to the copilot (character offsets in serialized Markdown context where applicable). */
export interface EditorSelectionState {
  from: number
  to: number
  text: string
}
