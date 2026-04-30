import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import type { WorkOrder } from '../../services/api'
import { WorkOrdersPage } from '../../pages/WorkOrdersPage'

function makeArchivedWo(): WorkOrder {
  const t = new Date().toISOString()
  return {
    id: 'wo-arch-1',
    project_id: 'p1',
    title: 'Archived task title',
    description: 'Desc',
    implementation_guide: null,
    acceptance_criteria: null,
    status: 'archived',
    phase: null,
    phase_order: null,
    assignee_id: null,
    assignee_display_name: null,
    is_stale: false,
    stale_reason: null,
    created_by: null,
    created_at: t,
    updated_at: t,
    section_ids: [],
  }
}

describe('WorkOrdersPage archived', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listSections').mockResolvedValue([])
    vi.spyOn(api, 'listMembers').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Archived column, line-through title, and no drag handle for archived card', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'm@b.com',
        display_name: 'M',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
    })
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([makeArchivedWo()])

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/studios/s1/software/sw1/projects/p1/work-orders',
        ]}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId/work-orders"
              element={<WorkOrdersPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await screen.findByText('Archived task title', {}, { timeout: 5000 })
    expect(
      screen.getByRole('heading', { name: 'Archived' }),
    ).toBeInTheDocument()

    const titleEl = screen.getByText('Archived task title')
    expect(titleEl).toHaveClass('line-through')

    expect(
      screen.queryByRole('button', { name: 'Drag to change status' }),
    ).toBeNull()
  })

  it('viewer does not see Generate work orders control', async () => {
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'v@b.com',
        display_name: 'V',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_viewer' },
      ],
    })
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([makeArchivedWo()])

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter
        initialEntries={[
          '/studios/s1/software/sw1/projects/p1/work-orders',
        ]}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/studios/:studioId/software/:softwareId/projects/:projectId/work-orders"
              element={<WorkOrdersPage />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Archived task title')).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: /generate/i }),
    ).toBeNull()
  })
})
