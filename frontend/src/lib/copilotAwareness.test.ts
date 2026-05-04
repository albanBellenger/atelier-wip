import { describe, expect, it } from 'vitest'

import type { YjsCollab } from '../hooks/useYjsCollab'
import { remoteAwarenessPeers } from './copilotAwareness'

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
})
