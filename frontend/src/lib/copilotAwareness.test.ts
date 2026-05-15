import { describe, expect, it } from 'vitest'

import { colorsForUser, type YjsCollab } from '../hooks/useYjsCollab'
import {
  collaboratorCountFromAwareness,
  remoteAwarenessPeers,
  remotePeerDisplayColor,
} from './copilotAwareness'

describe('remoteAwarenessPeers', () => {
  it('returns empty when collab is null', () => {
    expect(remoteAwarenessPeers(null)).toEqual([])
  })

  it('lists remote users with names from awareness states', () => {
    const collab = {
      awareness: {
        clientID: 1,
        getStates: (): Map<number, unknown> =>
          new Map([
            [
              1,
              {
                user: { name: 'Local', color: '#ff0000' },
              },
            ],
            [
              2,
              {
                user: { name: 'Remote Peer', color: '#00ff00' },
              },
            ],
          ]),
      },
    } as unknown as YjsCollab
    expect(remoteAwarenessPeers(collab)).toEqual([
      { name: 'Remote Peer', color: '#00ff00' },
    ])
  })

  it('dedupes multiple connections for the same userId', () => {
    const collab = {
      awareness: {
        clientID: 1,
        getStates: (): Map<number, unknown> =>
          new Map([
            [1, { user: { name: 'Local', color: '#f00', userId: 'L' } }],
            [2, { user: { name: 'Sam', color: '#0f0', userId: 'same' } }],
            [3, { user: { name: 'Sam', color: '#00f', userId: 'same' } }],
          ]),
      },
    } as unknown as YjsCollab
    expect(remoteAwarenessPeers(collab)).toEqual([
      { name: 'Sam', color: '#0f0', userId: 'same' },
    ])
  })
})

describe('remotePeerDisplayColor', () => {
  it('uses colorsForUser when userId is set', () => {
    const peer = { name: 'X', color: '#ff0000', userId: 'uid-xyz' }
    expect(remotePeerDisplayColor(peer)).toEqual(colorsForUser('uid-xyz').color)
  })

  it('falls back to awareness color when userId is missing', () => {
    const peer = { name: 'X', color: '#abcdef' }
    expect(remotePeerDisplayColor(peer)).toBe('#abcdef')
  })
})

describe('collaboratorCountFromAwareness', () => {
  it('counts distinct userIds once when the same user has two tabs', () => {
    const collab = {
      awareness: {
        getStates: (): Map<number, unknown> =>
          new Map([
            [1, { user: { name: 'Sam', userId: 'same' } }],
            [2, { user: { name: 'Sam', userId: 'same' } }],
          ]),
      },
    } as unknown as YjsCollab
    expect(collaboratorCountFromAwareness(collab)).toBe(1)
  })
})
