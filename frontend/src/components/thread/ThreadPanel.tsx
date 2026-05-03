import type { ReactElement } from 'react'
import type { EditorSelectionState } from '../editor/SplitEditor'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import { CopilotPanel, type CopilotDensity } from './CopilotPanel'

/** Section copilot: chat, context preview, critique, diff (Slices B–D). */
export function ThreadPanel(props: {
  projectId: string
  sectionId: string
  projectHref: string
  collab: YjsCollab | null
  editorSelection: EditorSelectionState | null
  onClearEditorSelection: () => void
  density?: CopilotDensity
  onDraftEmptyChange?: (empty: boolean) => void
}): ReactElement {
  const density = props.density ?? 'compact'
  if (density === 'focus') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CopilotPanel {...props} />
      </div>
    )
  }
  return <CopilotPanel {...props} />
}
