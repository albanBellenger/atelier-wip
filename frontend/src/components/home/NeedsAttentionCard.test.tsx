import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { NeedsAttentionCard } from './NeedsAttentionCard'

const sampleAttention: api.ProjectAttentionResponse = {
  studio_id: 's1',
  software_id: 'sw1',
  project_id: 'p1',
  counts: { all: 2, conflict: 1, drift: 1, gap: 0, update: 0 },
  items: [
    {
      id: 'issue:1',
      kind: 'conflict',
      title: 'a.md ↔ b.md',
      subtitle: 'Auto-detected on publish',
      description: 'Mismatch.',
      occurred_at: '2026-05-01T12:00:00.000Z',
      links: { issue_id: 'i1', work_order_id: null, section_id: 'sec1' },
    },
    {
      id: 'wo:2',
      kind: 'drift',
      title: 'WO-ABC123 · Fix thing',
      subtitle: 'Drift detector',
      description: 'Spec changed.',
      occurred_at: '2026-05-01T11:00:00.000Z',
      links: { issue_id: null, work_order_id: 'w1', section_id: null },
    },
  ],
}

describe('NeedsAttentionCard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads attention items and filters by tab', async () => {
    const spy = vi.spyOn(api, 'getProjectAttention').mockResolvedValue(sampleAttention)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <NeedsAttentionCard
            variant="project"
            studioId="s1"
            softwareId="sw1"
            projectId="p1"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('p1')
    })
    expect(await screen.findByText('Needs your attention')).toBeInTheDocument()
    expect(screen.getByText(/Mismatch\./)).toBeInTheDocument()
    expect(screen.getByText(/Spec changed\./)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Conflicts 1/i }))
    expect(screen.getByText(/Mismatch\./)).toBeInTheDocument()
    expect(screen.queryByText(/Spec changed\./)).not.toBeInTheDocument()
  })

  it('shows access message when API returns forbidden', async () => {
    vi.spyOn(api, 'getProjectAttention').mockRejectedValue({
      code: 'FORBIDDEN',
      detail: 'nope',
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <NeedsAttentionCard
            variant="project"
            studioId="s1"
            softwareId="sw1"
            projectId="p1"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/not available for your access level/i),
    ).toBeInTheDocument()
  })

  it('software variant lists cross-project rows and links to issues', async () => {
    const softwareAttention: api.SoftwareAttentionResponse = {
      studio_id: 's1',
      software_id: 'sw1',
      counts: { all: 1, conflict: 1, drift: 0, gap: 0, update: 0 },
      items: [
        {
          project_id: 'p99',
          project_name: 'Payment Module',
          item: {
            id: 'issue:x',
            kind: 'conflict',
            title: 'Data Model',
            subtitle: 'On publish',
            description: 'Section defines User.tier as enum.',
            occurred_at: '2026-05-01T12:00:00.000Z',
            links: { issue_id: 'i1', work_order_id: null, section_id: 'sec1' },
          },
        },
      ],
    }
    const spy = vi.spyOn(api, 'getSoftwareAttention').mockResolvedValue(softwareAttention)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <NeedsAttentionCard
            variant="software"
            studioId="s1"
            softwareId="sw1"
            issuesProjectId="p99"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('sw1')
    })
    expect(await screen.findByRole('heading', { name: /needs attention/i })).toBeInTheDocument()
    expect(screen.getByText('across all projects')).toBeInTheDocument()
    const viewAll = screen.getByRole('link', { name: /view all issues/i })
    expect(viewAll).toHaveAttribute(
      'href',
      '/studios/s1/software/sw1/projects/p99/issues',
    )
    expect(screen.getByText('Payment Module')).toBeInTheDocument()
    expect(
      screen.getByText(/Data Model — Section defines User\.tier as enum\./),
    ).toBeInTheDocument()
  })
})
