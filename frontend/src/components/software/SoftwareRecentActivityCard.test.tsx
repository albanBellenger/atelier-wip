import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SoftwareActivityItem } from '../../services/api'
import { SoftwareRecentActivityCard } from './SoftwareRecentActivityCard'

const sampleItem: SoftwareActivityItem = {
  id: 'e1',
  verb: 'project_created',
  summary: 'Created project Alpha',
  actor_user_id: 'u1',
  entity_type: 'project',
  entity_id: 'p1',
  created_at: '2026-05-01T12:00:00.000Z',
  actor_display: 'Leslie Okafor',
  context_label: 'Alpha',
}

describe('SoftwareRecentActivityCard', () => {
  it('renders formatted rows when enabled', () => {
    render(
      <SoftwareRecentActivityCard
        enabled
        isPending={false}
        isError={false}
        items={[sampleItem]}
      />,
    )
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument()
    expect(screen.getByText(/L\. Okafor/)).toBeInTheDocument()
    expect(screen.getByText(/created/)).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText(/yesterday|ago|just now/i)).toBeInTheDocument()
  })

  it('uses yellow dot for drift-style verbs', () => {
    const driftItem: SoftwareActivityItem = {
      ...sampleItem,
      id: 'e2',
      verb: 'drift_flagged',
      summary: 'Drift on WO-1',
    }
    const { container } = render(
      <SoftwareRecentActivityCard
        enabled
        isPending={false}
        isError={false}
        items={[driftItem]}
      />,
    )
    const dot = container.querySelector('.rounded-full.bg-yellow-500')
    expect(dot).not.toBeNull()
  })

  it('shows default empty copy when there are no items', () => {
    render(
      <SoftwareRecentActivityCard
        enabled
        isPending={false}
        isError={false}
        items={[]}
      />,
    )
    expect(screen.getByText('No activity yet.')).toBeInTheDocument()
  })

  it('shows role message when activity feed is disabled', () => {
    render(
      <SoftwareRecentActivityCard
        enabled={false}
        isPending={false}
        isError={false}
        items={[]}
      />,
    )
    expect(
      screen.getByText(/Activity is available to members who can manage projects/i),
    ).toBeInTheDocument()
  })
})
