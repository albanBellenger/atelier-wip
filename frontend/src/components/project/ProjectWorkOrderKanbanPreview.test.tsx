import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ProjectWorkOrderKanbanPreview } from './ProjectWorkOrderKanbanPreview'
import type { SectionSummary, WorkOrder } from '../../services/api'

const secMap = new Map<string, SectionSummary>([
  [
    's1',
    {
      id: 's1',
      title: 'API',
      slug: 'api-contracts',
      order: 0,
      status: 'ready',
      updated_at: '',
    },
  ],
])

function wo(p: Partial<WorkOrder>): WorkOrder {
  return {
    id: p.id ?? 'wo-1',
    project_id: 'p1',
    title: p.title ?? 'Task',
    description: 'd',
    implementation_guide: null,
    acceptance_criteria: null,
    status: p.status ?? 'backlog',
    phase: p.phase ?? null,
    phase_order: p.phase_order ?? null,
    assignee_id: null,
    assignee_display_name: p.assignee_display_name ?? null,
    is_stale: p.is_stale ?? false,
    stale_reason: null,
    created_by: null,
    updated_by_id: null,
    updated_by_display_name: null,
    created_at: '',
    updated_at: '',
    section_ids: p.section_ids ?? ['s1'],
  }
}

describe('ProjectWorkOrderKanbanPreview', () => {
  it('renders status columns with uppercase headers', () => {
    render(
      <MemoryRouter>
        <ProjectWorkOrderKanbanPreview
          studioId="st"
          softwareId="sw"
          projectId="p1"
          workOrders={[wo({ id: 'a', status: 'backlog' })]}
          sectionsById={secMap}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('BACKLOG')).toBeInTheDocument()
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument()
  })

  it('switches to by phase columns when toggled', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProjectWorkOrderKanbanPreview
          studioId="st"
          softwareId="sw"
          projectId="p1"
          workOrders={[
            wo({
              id: 'w1',
              phase: 'Phase 1 — Foundation',
              status: 'done',
            }),
          ]}
          sectionsById={secMap}
        />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /by phase/i }))
    expect(
      screen.getByText('PHASE 1 — FOUNDATION'),
    ).toBeInTheDocument()
  })

  it('shows stale badge when work order is stale', () => {
    render(
      <MemoryRouter>
        <ProjectWorkOrderKanbanPreview
          studioId="st"
          softwareId="sw"
          projectId="p1"
          workOrders={[wo({ is_stale: true, status: 'in_progress' })]}
          sectionsById={secMap}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('stale')).toBeInTheDocument()
  })
})
