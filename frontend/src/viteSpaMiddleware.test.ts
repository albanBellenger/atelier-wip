import { describe, expect, it } from 'vitest'

import { isStudiosSoftwareProjectSpaPath } from '../viteSpaMiddleware'

describe('isStudiosSoftwareProjectSpaPath', () => {
  it('matches full browser path', () => {
    expect(
      isStudiosSoftwareProjectSpaPath(
        '/studios/s1/software/sw1/projects/p1/sections/sec1',
      ),
    ).toBe(true)
  })

  it('matches path as seen by /studios proxy (mount stripped)', () => {
    expect(
      isStudiosSoftwareProjectSpaPath(
        '/s1/software/sw1/projects/p1/sections/sec1',
      ),
    ).toBe(true)
  })

  it('does not match API list software', () => {
    expect(isStudiosSoftwareProjectSpaPath('/studios/s1/software')).toBe(false)
  })

  it('does not match API project path', () => {
    expect(isStudiosSoftwareProjectSpaPath('/software/sw1/projects/p1')).toBe(
      false,
    )
  })
})
