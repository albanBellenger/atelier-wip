import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ProjectOutlineCard } from './ProjectOutlineCard'
import type { SectionSummary, WorkOrder } from '../../services/api'

const baseSection = (over: Partial<SectionSummary>): SectionSummary => ({
  id: 's1',
  title: 'Intro',
  slug: 'intro',
  order: 0,
  status: 'ready',
  updated_at: '2026-05-01T12:00:00.000Z',
  ...over,
})

describe('ProjectOutlineCard', () => {
  it('shows landing status pills for section statuses', () => {
    render(
      <MemoryRouter>
        <ProjectOutlineCard
          sections={[
            baseSection({ id: 'a', status: 'ready', order: 0 }),
            baseSection({
              id: 'b',
              title: 'API',
              slug: 'api',
              order: 1,
              status: 'gaps',
            }),
          ]}
          workOrders={[]}
          issues={[]}
          canManageOutline={false}
          onSelectSection={vi.fn()}
          onDeleteSection={vi.fn()}
          onReorder={vi.fn()}
          newTitle=""
          onNewTitleChange={vi.fn()}
          onAddSection={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('section-status-pill-ready')).toHaveTextContent(
      'Complete',
    )
    expect(screen.getByTestId('section-status-pill-gaps')).toHaveTextContent(
      'In progress',
    )
  })

  it('does not render + New section for viewers', () => {
    render(
      <MemoryRouter>
        <ProjectOutlineCard
          sections={[baseSection({})]}
          workOrders={[]}
          issues={[]}
          canManageOutline={false}
          onSelectSection={vi.fn()}
          onDeleteSection={vi.fn()}
          onReorder={vi.fn()}
          newTitle=""
          onNewTitleChange={vi.fn()}
          onAddSection={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(
      screen.queryByRole('button', { name: /new section/i }),
    ).not.toBeInTheDocument()
  })

  it('shows work order count per section', () => {
    const wos: WorkOrder[] = [
      {
        id: 'wo1',
        project_id: 'p1',
        title: 'T',
        description: 'd',
        implementation_guide: null,
        acceptance_criteria: null,
        status: 'backlog',
        phase: null,
        phase_order: null,
        assignee_id: null,
        assignee_display_name: null,
        is_stale: false,
        stale_reason: null,
        created_by: null,
        updated_by_id: null,
        updated_by_display_name: null,
        created_at: '',
        updated_at: '',
        section_ids: ['s1'],
      },
    ]
    render(
      <MemoryRouter>
        <ProjectOutlineCard
          sections={[baseSection({ id: 's1' })]}
          workOrders={wos}
          issues={[]}
          canManageOutline={false}
          onSelectSection={vi.fn()}
          onDeleteSection={vi.fn()}
          onReorder={vi.fn()}
          newTitle=""
          onNewTitleChange={vi.fn()}
          onAddSection={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('1 WOs')).toBeInTheDocument()
  })

  it('opens add row when + New section is clicked for admins', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ProjectOutlineCard
          sections={[baseSection({})]}
          workOrders={[]}
          issues={[]}
          canManageOutline
          onSelectSection={vi.fn()}
          onDeleteSection={vi.fn()}
          onReorder={vi.fn()}
          newTitle=""
          onNewTitleChange={vi.fn()}
          onAddSection={vi.fn()}
        />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /new section/i }))
    expect(
      screen.getByPlaceholderText('New section title'),
    ).toBeInTheDocument()
  })
})
