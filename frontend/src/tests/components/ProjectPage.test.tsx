import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import * as api from '../../services/api'
import { ProjectPage } from '../../pages/ProjectPage'

describe('ProjectPage publish success', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows toast commit link and does not call window.alert', async () => {
    const user = userEvent.setup()
    const publishSpy = vi.spyOn(api, 'publishProject').mockResolvedValue({
      commit_url: 'https://gitlab.example.com/commit/abc',
      files_committed: 3,
    })
    vi.spyOn(api, 'me').mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        display_name: 'A',
        is_tool_admin: false,
      },
      studios: [
        { studio_id: 's1', studio_name: 'S', role: 'studio_member' },
      ],
    })
    vi.spyOn(api, 'getProject').mockResolvedValue({
      id: 'p1',
      software_id: 'sw1',
      name: 'Proj',
      description: null,
      created_at: '',
      updated_at: '',
      sections: [
        {
          id: 'sec1',
          title: 'Intro',
          slug: 'intro',
          order: 0,
        },
      ],
    })
    vi.spyOn(api, 'getSection').mockResolvedValue({
      id: 'sec1',
      project_id: 'p1',
      title: 'Intro',
      slug: 'intro',
      content: 'Hi',
      created_at: '',
      updated_at: '',
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <>
        <Toaster />
        <MemoryRouter
          initialEntries={['/studios/s1/software/sw1/projects/p1']}
        >
          <QueryClientProvider client={qc}>
            <Routes>
              <Route
                path="/studios/:studioId/software/:softwareId/projects/:projectId"
                element={<ProjectPage />}
              />
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish…' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Publish…' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => {
      expect(publishSpy).toHaveBeenCalledWith('p1', { commit_message: null })
    })

    const link = await screen.findByRole('link', { name: /view commit/i })
    expect(link).toHaveAttribute('href', 'https://gitlab.example.com/commit/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')

    expect(window.alert).not.toHaveBeenCalled()
  })
})
