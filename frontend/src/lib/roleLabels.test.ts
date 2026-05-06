import { describe, expect, it } from 'vitest'

import {
  STUDIO_ROLE_OPTIONS,
  crossStudioAccessLabel,
  studioRoleLabel,
} from './roleLabels'

describe('studioRoleLabel', () => {
  it('maps studio wire roles to short and long labels', () => {
    expect(studioRoleLabel('studio_admin')).toBe('Owner')
    expect(studioRoleLabel('studio_admin', 'long')).toBe('Studio Owner')
    expect(studioRoleLabel('studio_member')).toBe('Builder')
    expect(studioRoleLabel('studio_member', 'long')).toBe('Studio Builder')
    expect(studioRoleLabel('studio_viewer')).toBe('Viewer')
    expect(studioRoleLabel('studio_viewer', 'long')).toBe('Studio Viewer')
  })

  it('passes through unknown roles', () => {
    expect(studioRoleLabel('custom_role')).toBe('custom_role')
  })

  it('treats legacy viewer as Viewer', () => {
    expect(studioRoleLabel('viewer')).toBe('Viewer')
  })
})

describe('crossStudioAccessLabel', () => {
  it('maps cross-studio access levels', () => {
    expect(crossStudioAccessLabel('external_editor')).toBe('External')
    expect(crossStudioAccessLabel('viewer')).toBe('Viewer')
  })
})

describe('STUDIO_ROLE_OPTIONS', () => {
  it('covers all three studio wire roles', () => {
    expect(STUDIO_ROLE_OPTIONS.map((o) => o.value).sort()).toEqual(
      ['studio_admin', 'studio_member', 'studio_viewer'].sort(),
    )
  })
})
