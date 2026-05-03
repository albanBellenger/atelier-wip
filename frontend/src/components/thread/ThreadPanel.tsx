import type { ReactElement } from 'react'
import type { EditorSelectionState } from '../editor/SplitEditor'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import { CopilotPanel } from './CopilotPanel'

/** Section copilot: chat, context preview, critique, diff (Slices B–D). */
export function ThreadPanel(props: {
  projectId: string
  sectionId: string
  projectHref: string
  collab: YjsCollab | null
  editorSelection: EditorSelectionState | null
  onClearEditorSelection: () => void
}): ReactElement {
  return <CopilotPanel {...props} />
}
