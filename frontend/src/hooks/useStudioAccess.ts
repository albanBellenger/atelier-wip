import { useMemo } from 'react'
import type { CrossStudioGrantPublic, MeResponse } from '../services/api'

/**
 * Studio-scoped permissions; optional ``softwareId`` resolves cross-studio grants on owner-studio URLs.
 *
 * Product language (see ``frontend/src/lib/roleLabels.ts``): home-studio wire roles are
 * ``studio_admin`` (Studio Owner), ``studio_member`` (Studio Builder), ``studio_viewer`` (Studio Viewer).
 * ``isStudioAdmin`` / ``isStudioEditor`` follow those wire values, not the display strings.
 *
 * ``canEditSoftwareDefinition`` follows FR §6.2: only Tool Admin and home-studio ``studio_admin``
 * (Studio Owner). Builders must not see this as true even though they may edit specs elsewhere.
 */
export function useStudioAccess(
  profile: MeResponse | undefined,
  studioId: string | undefined,
  softwareId?: string,
): {
  role: string | null
  isMember: boolean
  isStudioAdmin: boolean
  isStudioEditor: boolean
  isToolAdmin: boolean
  isCrossStudioViewer: boolean
  canPublish: boolean
  canManageProjectOutline: boolean
  canEditSoftwareDefinition: boolean
  canCreateProject: boolean
  crossGrant: CrossStudioGrantPublic | null
} {
  return useMemo(() => {
    const isToolAdmin = profile?.user?.is_tool_admin ?? false
    const row = profile?.studios.find((s) => s.studio_id === studioId)
    const role = row?.role ?? null

    const crossGrant = (() => {
      const grants = profile?.cross_studio_grants ?? []
      if (!grants.length || !softwareId || !studioId) return null
      return (
        grants.find(
          (g) =>
            g.target_software_id === softwareId &&
            g.owner_studio_id === studioId,
        ) ?? null
      )
    })()

    const isHomeMember = isToolAdmin || Boolean(row)
    const isMember = isHomeMember || Boolean(crossGrant)

    const homeStudioAdmin =
      isToolAdmin || (!crossGrant && role === 'studio_admin')
    const isStudioAdmin = homeStudioAdmin

    const homeEditor =
      isToolAdmin ||
      role === 'studio_admin' ||
      role === 'studio_member'

    const isStudioEditor =
      Boolean(homeEditor) || crossGrant?.access_level === 'external_editor'

    const isCrossStudioViewer = crossGrant?.access_level === 'viewer'

    const canPublish = isToolAdmin || (!crossGrant && Boolean(isStudioEditor))

    const canManageProjectOutline =
      !crossGrant && (isToolAdmin || role === 'studio_admin')

    const canEditSoftwareDefinition =
      !crossGrant && (isToolAdmin || role === 'studio_admin')

    const canCreateProject =
      !crossGrant &&
      (isToolAdmin ||
        role === 'studio_admin' ||
        role === 'studio_member')

    return {
      role,
      isMember,
      isStudioAdmin,
      isStudioEditor,
      isToolAdmin,
      isCrossStudioViewer,
      canPublish,
      canManageProjectOutline,
      canEditSoftwareDefinition,
      canCreateProject,
      crossGrant,
    }
  }, [profile, studioId, softwareId])
}
