import type { ReactElement } from 'react'
import type { EditorSelectionState } from '../editor/SplitEditor'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import type { SectionHealth } from '../../services/api'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import {
  CopilotPanel,
  type CopilotDensity,
} from './CopilotPanel'
import type { CopilotSideTab } from './CopilotStatusStrip'

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
  healthSummary?: SectionHealth | null
  canEditContext?: boolean
  onPatchOverlayChange?: (state: SectionPatchOverlayState | null) => void
  contextRagQuerySynced?: string
  onContextRagQuerySyncedChange?: (q: string) => void
  copilotTabRequest?: { id: number; tab: CopilotSideTab } | null
}): ReactElement {
  const density = props.density ?? 'compact'
  if (density === 'focus') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CopilotPanel
          projectId={props.projectId}
          sectionId={props.sectionId}
          projectHref={props.projectHref}
          collab={props.collab}
          editorSelection={props.editorSelection}
          onClearEditorSelection={props.onClearEditorSelection}
          density={props.density}
          onDraftEmptyChange={props.onDraftEmptyChange}
          healthSummary={props.healthSummary}
          canEditContext={props.canEditContext}
          onPatchOverlayChange={props.onPatchOverlayChange}
          contextRagQuerySynced={props.contextRagQuerySynced}
          onContextRagQuerySyncedChange={props.onContextRagQuerySyncedChange}
          copilotTabRequest={props.copilotTabRequest}
        />
      </div>
    )
  }
  return (
    <CopilotPanel
      projectId={props.projectId}
      sectionId={props.sectionId}
      projectHref={props.projectHref}
      collab={props.collab}
      editorSelection={props.editorSelection}
      onClearEditorSelection={props.onClearEditorSelection}
      healthSummary={props.healthSummary}
      canEditContext={props.canEditContext}
      onPatchOverlayChange={props.onPatchOverlayChange}
      contextRagQuerySynced={props.contextRagQuerySynced}
      onContextRagQuerySyncedChange={props.onContextRagQuerySyncedChange}
      copilotTabRequest={props.copilotTabRequest}
    />
  )
}
