import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { SoftwareDocsTab } from './SoftwareDocsTab'

function wrap(ui: ReactElement): ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <MemoryRouter initialEntries={['/studios/st/software/sw']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/studios/:studioId/software/:softwareId"
            element={ui}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('SoftwareDocsTab backprop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render outline draft control for non-owners', async () => {
    vi.spyOn(api, 'listSoftwareDocsSections').mockResolvedValue([])
    vi.spyOn(api, 'listCodebaseSnapshots').mockResolvedValue([
      {
        id: '1',
        software_id: 'sw',
        commit_sha: 'a'.repeat(40),
        branch: 'main',
        status: 'ready',
        error_message: null,
        created_at: new Date().toISOString(),
        ready_at: new Date().toISOString(),
        file_count: 1,
        chunk_count: 1,
      },
    ])
    render(
      wrap(
        <SoftwareDocsTab studioId="st" softwareId="sw" canManageOutline={false} />,
      ),
    )
    await screen.findByText(/software documentation/i)
    expect(screen.queryByRole('button', { name: /draft outline from codebase/i })).toBeNull()
  })

  it('enables outline draft when a ready snapshot exists', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'listSoftwareDocsSections').mockResolvedValue([])
    vi.spyOn(api, 'listCodebaseSnapshots').mockResolvedValue([
      {
        id: '1',
        software_id: 'sw',
        commit_sha: 'a'.repeat(40),
        branch: 'main',
        status: 'ready',
        error_message: null,
        created_at: new Date().toISOString(),
        ready_at: new Date().toISOString(),
        file_count: 1,
        chunk_count: 1,
      },
    ])
    vi.spyOn(api, 'proposeSoftwareDocsOutline').mockResolvedValue({
      sections: [{ title: 'A', slug: 'a', summary: 'S' }],
    })
    vi.spyOn(api, 'createSoftwareDocsSection').mockResolvedValue({
      id: 'new-1',
      project_id: null,
      software_id: 'sw',
      title: 'A',
      slug: 'a',
      order: 0,
      content: '',
      status: 'draft',
      open_issue_count: 0,
      outline_health: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    render(
      wrap(<SoftwareDocsTab studioId="st" softwareId="sw" canManageOutline />),
    )
    const draftBtn = await screen.findByRole('button', { name: /draft outline from codebase/i })
    await waitFor(() => expect(draftBtn).not.toBeDisabled())
    await user.click(draftBtn)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /propose outline/i }))
    expect(await screen.findByText('A')).toBeTruthy()
    const cb = await screen.findByRole('checkbox')
    await user.click(cb)
    await user.click(screen.getByRole('button', { name: /accept selected/i }))
    expect(api.createSoftwareDocsSection).toHaveBeenCalled()
  })
})
