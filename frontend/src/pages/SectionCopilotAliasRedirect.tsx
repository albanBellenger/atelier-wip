import type { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router-dom'

/**
 * There is no standalone copilot URL — the private thread UI lives on the
 * section page (right-hand panel). This route strips a mistaken `/copilot`
 * suffix so bookmarks or links do not fall through to `*` → `/`.
 */
export function SectionCopilotAliasRedirect(): ReactElement {
  const { studioId, softwareId, projectId, sectionId } = useParams<{
    studioId: string
    softwareId: string
    projectId: string
    sectionId: string
  }>()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const pid = projectId ?? ''
  const secid = sectionId ?? ''
  const to = `/studios/${sid}/software/${sfid}/projects/${pid}/sections/${secid}`
  return <Navigate to={to} replace />
}
