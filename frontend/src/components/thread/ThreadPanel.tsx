import type { ReactElement, RefObject } from 'react'
import type { EditorSelectionState } from '../editor/editorSelection'
import type { CrepeEditorApi } from '../editor/CrepeEditor'
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
  studioId: string
  projectId: string
  sectionId: string
  projectHref: string
  collab: YjsCollab | null
  sectionEditorApiRef: RefObject<CrepeEditorApi | null>
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
  onRegisterCopilotDraftSetter?: (setDraft: (value: string) => void) => void
  onRegisterCopilotSlashExecutor?: (
    run: (rawComposerLine: string) => void | Promise<void>,
  ) => void
}): ReactElement {
  const density = props.density ?? 'compact'
  if (density === 'focus') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CopilotPanel
          studioId={props.studioId}
          projectId={props.projectId}
          sectionId={props.sectionId}
          projectHref={props.projectHref}
          collab={props.collab}
          sectionEditorApiRef={props.sectionEditorApiRef}
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
          onRegisterCopilotDraftSetter={props.onRegisterCopilotDraftSetter}
          onRegisterCopilotSlashExecutor={props.onRegisterCopilotSlashExecutor}
        />
      </div>
    )
  }
  return (
    <CopilotPanel
      studioId={props.studioId}
      projectId={props.projectId}
      sectionId={props.sectionId}
      projectHref={props.projectHref}
      collab={props.collab}
      sectionEditorApiRef={props.sectionEditorApiRef}
      editorSelection={props.editorSelection}
      onClearEditorSelection={props.onClearEditorSelection}
      healthSummary={props.healthSummary}
      canEditContext={props.canEditContext}
      onPatchOverlayChange={props.onPatchOverlayChange}
      contextRagQuerySynced={props.contextRagQuerySynced}
      onContextRagQuerySyncedChange={props.onContextRagQuerySyncedChange}
      copilotTabRequest={props.copilotTabRequest}
      onRegisterCopilotDraftSetter={props.onRegisterCopilotDraftSetter}
      onRegisterCopilotSlashExecutor={props.onRegisterCopilotSlashExecutor}
    />
  )
}
