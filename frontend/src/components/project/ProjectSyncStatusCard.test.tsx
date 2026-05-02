import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ProjectSyncStatusCard } from './ProjectSyncStatusCard'
import type { SectionSummary } from '../../services/api'

function sec(over: Partial<SectionSummary>): SectionSummary {
  return {
    id: 's1',
    title: 'Intro',
    slug: 'intro',
    order: 0,
    status: 'ready',
    updated_at: '2026-05-01T12:00:00.000Z',
    ...over,
  }
}

describe('ProjectSyncStatusCard', () => {
  it('shows pending badge and publish CTA when sections need sync', () => {
    const onPublish = vi.fn()
    render(
      <MemoryRouter>
        <ProjectSyncStatusCard
          sections={[
            sec({ id: 'a', status: 'empty', slug: 'auth' }),
            sec({ id: 'b', status: 'gaps', slug: 'ia' }),
          ]}
          baselineSha="a3f1c8e"
          baselineRelative="4h ago"
          gitConfigured
          canPublish
          onPublishClick={onPublish}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('2 pending')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /publish 2 changes/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('auth.md')).toBeInTheDocument()
    expect(screen.getByText('ia.md')).toBeInTheDocument()
  })

  it('does not render publish button when user cannot publish', () => {
    render(
      <MemoryRouter>
        <ProjectSyncStatusCard
          sections={[sec({ status: 'gaps' })]}
          baselineSha="abc"
          baselineRelative="1h ago"
          gitConfigured
          canPublish={false}
          onPublishClick={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(
      screen.queryByRole('button', { name: /publish/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onPublishClick when publish button is pressed', async () => {
    const user = userEvent.setup()
    const onPublish = vi.fn()
    render(
      <MemoryRouter>
        <ProjectSyncStatusCard
          sections={[sec({ status: 'empty' })]}
          baselineSha="x"
          baselineRelative="now"
          gitConfigured
          canPublish
          onPublishClick={onPublish}
        />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /publish 1 change/i }))
    expect(onPublish).toHaveBeenCalledTimes(1)
  })
})
