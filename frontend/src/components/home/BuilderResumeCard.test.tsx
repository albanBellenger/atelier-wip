import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { BuilderResumeCard } from './BuilderResumeCard'
import type { WorkOrder } from '../../services/api'

const minimalWo = (o: Partial<WorkOrder> & Pick<WorkOrder, 'id' | 'title'>): WorkOrder => ({
  id: o.id,
  project_id: o.project_id ?? 'p1',
  title: o.title,
  description: o.description ?? '',
  implementation_guide: o.implementation_guide ?? null,
  acceptance_criteria: o.acceptance_criteria ?? null,
  status: o.status ?? 'in_progress',
  phase: o.phase ?? null,
  phase_order: o.phase_order ?? null,
  assignee_id: o.assignee_id ?? null,
  assignee_display_name: o.assignee_display_name ?? null,
  is_stale: o.is_stale ?? false,
  stale_reason: o.stale_reason ?? null,
  created_by: o.created_by ?? null,
  updated_by_id: o.updated_by_id ?? null,
  updated_by_display_name: o.updated_by_display_name ?? null,
  created_at: o.created_at ?? '2026-05-01T08:00:00.000Z',
  updated_at: o.updated_at ?? '2026-05-01T16:00:00.000Z',
  section_ids: o.section_ids ?? [],
})

describe('BuilderResumeCard', () => {
  it('renders section, work order, and project chat links', () => {
    render(
      <MemoryRouter>
        <BuilderResumeCard
          studioId="s1"
          softwareId="sw1"
          projectId="p1"
          projectName="My project"
          projectUpdatedAt="2026-05-01T10:00:00.000Z"
          sections={[
            {
              id: 'sec1',
              title: 'data-model.md',
              slug: 'dm',
              order: 0,
              status: 'ready',
              updated_at: '2026-05-01T12:00:00.000Z',
            },
          ]}
          workOrders={[
            minimalWo({
              id: 'w1',
              title: 'WO-114 Tier upgrade',
              status: 'in_progress',
              updated_at: '2026-05-01T16:00:00.000Z',
            }),
          ]}
          isPending={false}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /resume/i })).toBeInTheDocument()
    expect(screen.getByText('data-model.md')).toBeInTheDocument()
    expect(screen.getByText('WO-114 Tier upgrade')).toBeInTheDocument()
    expect(screen.getByText('Project chat')).toBeInTheDocument()
    const chat = screen.getByRole('link', { name: /project chat/i })
    expect(chat).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p1?tab=chat',
    )
    expect(
      screen.getByRole('link', { name: /data-model\.md/i }),
    ).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p1/sections/sec1',
    )
  })
})
