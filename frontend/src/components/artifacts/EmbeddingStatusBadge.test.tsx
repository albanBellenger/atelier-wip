import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { EmbeddingStatusBadge } from './EmbeddingStatusBadge'

describe('EmbeddingStatusBadge', () => {
  it('renders nothing when status is undefined', () => {
    const { container } = render(
      <EmbeddingStatusBadge status={undefined} embeddedAt={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders embedded with tooltip containing chunk count and indexed time', () => {
    render(
      <EmbeddingStatusBadge
        status="embedded"
        embeddedAt="2026-01-15T12:00:00Z"
        chunkCount={3}
      />,
    )
    expect(screen.getByText('Indexed')).toBeInTheDocument()
    const pill = screen.getByText('Indexed').closest('span')
    expect(pill).toHaveAttribute('title', expect.stringMatching(/3 chunks/))
    expect(pill?.getAttribute('title')).toMatch(/indexed/)
  })

  it('renders pending with in-progress tooltip', async () => {
    const user = userEvent.setup()
    render(<EmbeddingStatusBadge status="pending" />)
    const pill = screen.getByText('Indexing…')
    expect(pill).toBeInTheDocument()
    expect(pill.closest('span')).toHaveAttribute(
      'title',
      'Embedding in progress',
    )
    await user.hover(pill)
    expect(pill.closest('span')).toHaveAttribute(
      'title',
      'Embedding in progress',
    )
  })

  it('renders failed with see-details tooltip', () => {
    render(<EmbeddingStatusBadge status="failed" />)
    const pill = screen.getByText('Index failed')
    expect(pill).toBeInTheDocument()
    expect(pill.closest('span')).toHaveAttribute(
      'title',
      'Could not index — see details',
    )
  })

  it('renders skipped with not-configured tooltip', () => {
    render(<EmbeddingStatusBadge status="skipped" />)
    const pill = screen.getByText('Not indexed')
    expect(pill).toBeInTheDocument()
    expect(pill.closest('span')).toHaveAttribute(
      'title',
      'Embedding not configured at upload time',
    )
  })

  it('allows studio viewers to see read-only indexing state (no privileged control)', () => {
    render(
      <div>
        <p>Viewer context</p>
        <EmbeddingStatusBadge status="embedded" chunkCount={1} embeddedAt="2026-01-01T00:00:00Z" />
      </div>,
    )
    expect(screen.getByText('Viewer context')).toBeInTheDocument()
    expect(screen.getByText('Indexed')).toBeInTheDocument()
  })
})
