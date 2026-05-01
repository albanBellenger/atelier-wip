import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { CritiqueTab } from './CritiqueTab'

describe('CritiqueTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists issues and work orders for the section', async () => {
    vi.spyOn(api, 'listProjectIssues').mockResolvedValue([
      {
        id: 'i1',
        project_id: 'p1',
        triggered_by: null,
        section_a_id: 'sec1',
        section_b_id: null,
        description: 'Gap in API',
        status: 'open',
        origin: 'manual',
        run_actor_id: null,
        created_at: new Date().toISOString(),
      },
    ])
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([
      {
        id: 'w1',
        project_id: 'p1',
        title: 'Fix gap',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        section_ids: ['sec1'],
      },
    ])

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <CritiqueTab projectId="p1" sectionId="sec1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(api.listProjectIssues).toHaveBeenCalledWith('p1', {
        sectionId: 'sec1',
      })
    })
    await waitFor(() => {
      expect(api.listWorkOrders).toHaveBeenCalledWith('p1', {
        section_id: 'sec1',
      })
    })
    await waitFor(() => {
      expect(screen.getByText('Gap in API')).toBeInTheDocument()
    })
    expect(screen.getByText('Fix gap')).toBeInTheDocument()
  })

  it('has no apply-to-editor control', () => {
    vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <CritiqueTab projectId="p1" sectionId="sec1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(
      screen.queryByRole('button', { name: 'Apply to editor' }),
    ).toBeNull()
  })
})
