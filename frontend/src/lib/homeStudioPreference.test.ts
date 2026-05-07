import { describe, expect, it, beforeEach } from 'vitest'

import {
  HOME_STUDIO_ID_LS_KEY,
  resolveHomeStudioId,
  resolveLlmUsageHeaderStudioId,
} from './homeStudioPreference'
import type { MeResponse } from '../services/api'

function profileTwo(): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Alex',
      is_platform_admin: false,
    },
    studios: [
      { studio_id: 's-first', studio_name: 'First', role: 'studio_member' },
      { studio_id: 's-second', studio_name: 'Second', role: 'studio_member' },
    ],
    cross_studio_grants: [],
  }
}

describe('homeStudioPreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resolveHomeStudioId uses localStorage when valid', () => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, 's-second')
    expect(resolveHomeStudioId(profileTwo())).toBe('s-second')
  })

  it('resolveHomeStudioId ignores unknown localStorage id', () => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, 'gone')
    expect(resolveHomeStudioId(profileTwo())).toBe('s-first')
  })

  it('resolveHomeStudioId returns null when user has no studios', () => {
    const empty: MeResponse = {
      ...profileTwo(),
      studios: [],
    }
    expect(resolveHomeStudioId(empty)).toBeNull()
  })

  it('resolveLlmUsageHeaderStudioId prefers a single studio_id in the URL', () => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, 's-second')
    const sp = new URLSearchParams()
    sp.set('studio_id', 's-first')
    expect(resolveLlmUsageHeaderStudioId(profileTwo(), sp)).toBe('s-first')
  })

  it('resolveLlmUsageHeaderStudioId falls back when URL studio is unknown', () => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, 's-second')
    const sp = new URLSearchParams()
    sp.set('studio_id', 'nope')
    expect(resolveLlmUsageHeaderStudioId(profileTwo(), sp)).toBe('s-second')
  })

  it('resolveLlmUsageHeaderStudioId falls back when multiple studio_ids in URL', () => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, 's-second')
    const sp = new URLSearchParams()
    sp.append('studio_id', 's-first')
    sp.append('studio_id', 's-second')
    expect(resolveLlmUsageHeaderStudioId(profileTwo(), sp)).toBe('s-second')
  })
})
