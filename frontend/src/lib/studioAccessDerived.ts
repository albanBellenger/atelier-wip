import type { CrossStudioGrantPublic, MeResponse, StudioCapabilitiesOut } from '../services/api'

/** Camel-case permission shape returned by ``useStudioAccess`` (excluding loading flags). */
export type StudioAccessFields = {
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
}

export function mapStudioCapabilitiesOutToFields(
  c: StudioCapabilitiesOut,
): StudioAccessFields {
  return {
    role: c.membership_role,
    isMember: c.is_studio_member,
    isStudioAdmin: c.is_studio_admin,
    isStudioEditor: c.is_studio_editor,
    isToolAdmin: c.is_tool_admin,
    isCrossStudioViewer: c.is_cross_studio_viewer,
    canPublish: c.can_publish,
    canManageProjectOutline: c.can_manage_project_outline,
    canEditSoftwareDefinition: c.can_edit_software_definition,
    canCreateProject: c.can_create_project,
    crossGrant: c.cross_studio_grant,
  }
}

/**
 * Client-side derivation when no ``studioId`` is in scope (nav shell). Prefer
 * ``GET /studios/{id}/me/capabilities`` whenever ``studioId`` is known.
 */
export function deriveStudioAccessFromProfile(
  profile: MeResponse | undefined,
  studioId: string | undefined,
  softwareId?: string,
): StudioAccessFields {
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
    isToolAdmin || role === 'studio_admin' || role === 'studio_member'

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
    (isToolAdmin || role === 'studio_admin' || role === 'studio_member')

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
}

/** Used by Vitest to stub ``getStudioCapabilities`` consistently with derived rules. */
export function studioCapabilitiesOutFromProfile(
  profile: MeResponse,
  studioId: string,
  softwareId?: string,
): StudioCapabilitiesOut {
  const f = deriveStudioAccessFromProfile(profile, studioId, softwareId)
  return {
    is_tool_admin: f.isToolAdmin,
    membership_role: f.role,
    is_studio_admin: f.isStudioAdmin,
    is_studio_editor: f.isStudioEditor,
    is_studio_member: f.isMember,
    is_cross_studio_viewer: f.isCrossStudioViewer,
    can_publish: f.canPublish,
    can_edit_software_definition: f.canEditSoftwareDefinition,
    can_create_project: f.canCreateProject,
    can_manage_project_outline: f.canManageProjectOutline,
    cross_studio_grant: f.crossGrant,
  }
}
