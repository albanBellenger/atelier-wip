import type { ReactElement } from 'react'

import type { RemoteAwarenessPeer } from '../../lib/copilotAwareness'
import { remotePeerDisplayColor } from '../../lib/copilotAwareness'

const MAX_VISIBLE = 4

function peerInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '?'
}

function peerKey(peer: RemoteAwarenessPeer, index: number): string {
  if (peer.userId != null && peer.userId !== '') {
    return peer.userId
  }
  return `${peer.name}:${index}`
}

export function CollaboratorPresenceStack(props: {
  peers: readonly RemoteAwarenessPeer[]
}): ReactElement | null {
  if (props.peers.length === 0) {
    return null
  }
  const visible = props.peers.slice(0, MAX_VISIBLE)
  const overflow = props.peers.length - visible.length

  return (
    <div
      className="flex items-center"
      aria-label="Collaborators in this editor"
    >
      {visible.map((p, i) => (
        <span
          key={peerKey(p, i)}
          title={p.name}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-zinc-950 text-[10px] font-semibold text-white shadow-sm ${
            i > 0 ? '-ml-2' : ''
          }`}
          style={{ backgroundColor: remotePeerDisplayColor(p) }}
        >
          {peerInitials(p.name)}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="-ml-2 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-800 px-1.5 text-[10px] font-medium text-zinc-200"
          title={`${overflow} more collaborator${overflow === 1 ? '' : 's'}`}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}
