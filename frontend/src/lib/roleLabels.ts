/** Wire-format studio roles from the API (values unchanged). */
export type StudioRoleWire = 'studio_admin' | 'studio_member' | 'studio_viewer'

export const STUDIO_ROLE_OPTIONS: {
  value: StudioRoleWire
  short: string
  long: string
}[] = [
  { value: 'studio_admin', short: 'Owner', long: 'Studio Owner' },
  { value: 'studio_member', short: 'Builder', long: 'Studio Builder' },
  { value: 'studio_viewer', short: 'Viewer', long: 'Studio Viewer' },
]

/**
 * Human label for a home-studio role from the API (`studio_*` wire values).
 * Unknown strings are returned unchanged (safe for forward compatibility).
 */
export function studioRoleLabel(role: string, variant: 'short' | 'long' = 'short'): string {
  const row = STUDIO_ROLE_OPTIONS.find((o) => o.value === role)
  if (row) {
    return variant === 'long' ? row.long : row.short
  }
  // Legacy or non-studio rows on `/auth/me` (display only)
  if (role === 'viewer') {
    return variant === 'long' ? 'Studio Viewer' : 'Viewer'
  }
  return role
}

/** Cross-studio grant `access_level` wire values → display labels. */
export function crossStudioAccessLabel(
  level: string,
  variant: 'short' | 'long' = 'short',
): string {
  if (level === 'external_editor') {
    return variant === 'long' ? 'External' : 'External'
  }
  if (level === 'viewer') {
    return variant === 'long' ? 'Viewer (cross-studio)' : 'Viewer'
  }
  return level
}
