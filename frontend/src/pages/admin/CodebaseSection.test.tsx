import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { CodebaseSection } from './CodebaseSection'
import { CodebaseStudioSoftwareTable } from './CodebaseStudioSoftwareTable'

describe('CodebaseSection', () => {
  it('loads per-studio tables from admin overview API', async () => {
    vi.spyOn(api, 'getAdminCodebaseOverview').mockResolvedValue([
      {
        studio_id: 'st1',
        studio_name: 'Studio One',
        software: [
          {
            software_id: 'sw1',
            software_name: 'Product',
            git_configured: true,
            ready_file_count: 3,
            ready_chunk_count: 10,
            ready_symbol_count: 2,
            commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
            branch: 'main',
            ready_at: '2026-01-01T00:00:00Z',
            newest_snapshot_status: 'ready',
          },
        ],
      },
    ])
    vi.spyOn(api, 'postAdminCodebaseReindex').mockResolvedValue({
      id: 'snap1',
      software_id: 'sw1',
      commit_sha: 'aa',
      branch: 'main',
      status: 'pending',
      error_message: null,
      created_at: '2026-01-02T00:00:00Z',
      ready_at: null,
      file_count: 0,
      chunk_count: 0,
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <CodebaseSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /Codebase/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Studio One', exact: true })).toBeInTheDocument()
    expect(screen.getByText('Product', { exact: true })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open', exact: true })).toHaveAttribute(
        'href',
        '/studios/st1/software/sw1',
      )
    })
  })

  it('reindex triggers API for selected software', async () => {
    const user = userEvent.setup()
    const reindexSpy = vi.spyOn(api, 'postAdminCodebaseReindex').mockResolvedValue({
      id: 'snap1',
      software_id: 'sw1',
      commit_sha: 'aa',
      branch: 'main',
      status: 'pending',
      error_message: null,
      created_at: '2026-01-02T00:00:00Z',
      ready_at: null,
      file_count: 0,
      chunk_count: 0,
    })
    vi.spyOn(api, 'getAdminCodebaseOverview').mockResolvedValue([
      {
        studio_id: 'st1',
        studio_name: 'S',
        software: [
          {
            software_id: 'sw1',
            software_name: 'P',
            git_configured: true,
            ready_file_count: 0,
            ready_chunk_count: 0,
            ready_symbol_count: 0,
            commit_sha: null,
            branch: null,
            ready_at: null,
            newest_snapshot_status: 'none',
          },
        ],
      },
    ])

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <CodebaseSection />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await screen.findByRole('button', { name: 'Reindex', exact: true })
    await user.click(screen.getByRole('button', { name: 'Reindex', exact: true }))
    await waitFor(() => {
      expect(reindexSpy).toHaveBeenCalledWith('sw1')
    })
  })
})

describe('CodebaseStudioSoftwareTable', () => {
  it('does not render reindex controls when reindexActionsEnabled is false', () => {
    render(
      <MemoryRouter>
        <CodebaseStudioSoftwareTable
          studioId="st1"
          rows={[
            {
              software_id: 'sw1',
              software_name: 'P',
              git_configured: true,
              ready_file_count: 0,
              ready_chunk_count: 0,
              ready_symbol_count: 0,
              commit_sha: null,
              branch: null,
              ready_at: null,
              newest_snapshot_status: 'none',
            },
          ]}
          isPending={false}
          errorMessage={null}
          reindexActionsEnabled={false}
          mutatingSoftwareId={null}
          onReindex={() => {}}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Reindex', exact: true })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open', exact: true })).toBeInTheDocument()
  })
})
