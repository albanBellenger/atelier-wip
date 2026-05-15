import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { colorsForUser } from '../../hooks/useYjsCollab'
import type { RemoteAwarenessPeer } from '../../lib/copilotAwareness'
import { CollaboratorPresenceStack } from './CollaboratorPresenceStack'

describe('CollaboratorPresenceStack', () => {
  it('renders nothing when there are no peers', () => {
    const { container } = render(<CollaboratorPresenceStack peers={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows stacked initials for remote peers', () => {
    const peers: RemoteAwarenessPeer[] = [
      { name: 'Alex Smith', color: '#ff0000', userId: 'u1' },
    ]
    render(<CollaboratorPresenceStack peers={peers} />)
    expect(screen.getByLabelText('Collaborators in this editor')).toBeInTheDocument()
    expect(screen.getByTitle('Alex Smith')).toHaveTextContent('AS')
  })

  it('uses colorsForUser when userId is present so fill matches cursor colour', () => {
    const peers: RemoteAwarenessPeer[] = [
      { name: 'Pat', color: '#ff0000', userId: 'stable-peer-id' },
    ]
    render(<CollaboratorPresenceStack peers={peers} />)
    const expected = colorsForUser('stable-peer-id').color
    expect(screen.getByTitle('Pat')).toHaveStyle({
      backgroundColor: expected,
    })
  })

  it('shows at most four avatars and a +N overflow badge', () => {
    const peers: RemoteAwarenessPeer[] = [
      { name: 'A One', color: '#111', userId: 'a' },
      { name: 'B Two', color: '#222', userId: 'b' },
      { name: 'C Three', color: '#333', userId: 'c' },
      { name: 'D Four', color: '#444', userId: 'd' },
      { name: 'E Five', color: '#555', userId: 'e' },
      { name: 'F Six', color: '#666', userId: 'f' },
    ]
    render(<CollaboratorPresenceStack peers={peers} />)
    expect(screen.getByTitle('A One')).toBeInTheDocument()
    expect(screen.getByTitle('D Four')).toBeInTheDocument()
    expect(screen.queryByTitle('E Five')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('is display-only (no interactive controls for viewers)', () => {
    const peers: RemoteAwarenessPeer[] = [
      { name: 'Viewer Visible', color: '#888', userId: 'v' },
    ]
    render(<CollaboratorPresenceStack peers={peers} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
