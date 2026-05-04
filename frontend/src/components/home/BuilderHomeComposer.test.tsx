import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as sonner from 'sonner'

import { BuilderHomeComposer } from './BuilderHomeComposer'
import { mswServer } from '../../test-setup'
import type { MeResponse } from '../../services/api'

function editorProfile(): MeResponse {
  return {
    user: {
      id: 'u1',
      email: 'a@b.com',
      display_name: 'Alex Builder',
      is_tool_admin: false,
    },
    studios: [
      {
        studio_id: 's1',
        studio_name: 'Studio',
        role: 'studio_member',
      },
    ],
    cross_studio_grants: [],
  }
}

describe('BuilderHomeComposer', () => {
  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('navigates to software chat with draft on Enter when editor', async () => {
    const user = userEvent.setup()
    mswServer.use(
      http.post('http://api.test/me/builder-composer-hint', async () =>
        HttpResponse.json({
          headline: 'Ready when you are.',
          input_placeholder: 'Ask the team…',
        }),
      ),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/"
              element={
                <BuilderHomeComposer
                  profile={editorProfile()}
                  studioId="s1"
                  softwareId="sw1"
                  projectId="p1"
                  projectName="My project"
                  softwareName="My SW"
                  canUseSoftwareChat
                  canSeeComposerHint
                />
              }
            />
            <Route
              path="/studios/s1/software/sw1"
              element={<div data-testid="software-land">ok</div>}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Ask the team…')).toBeInTheDocument(),
    )
    await user.type(screen.getByPlaceholderText('Ask the team…'), 'hello')
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByTestId('software-land')).toBeInTheDocument(),
    )
  })

  it('viewer does not see Enter-to-chat hint and cannot type', async () => {
    mswServer.use(
      http.post('http://api.test/me/builder-composer-hint', async () =>
        HttpResponse.json({
          headline: 'Hello.',
          input_placeholder: 'Editors can chat here.',
        }),
      ),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <BuilderHomeComposer
            profile={editorProfile()}
            studioId="s1"
            softwareId="sw1"
            projectId={null}
            projectName={null}
            softwareName="SW"
            canUseSoftwareChat={false}
            canSeeComposerHint
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('Editors can chat here.'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByText(/Press Enter to open software chat/i),
    ).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Editors can chat here.')).toBeDisabled()
  })

  it('/help shows a toast and does not navigate', async () => {
    const user = userEvent.setup()
    const toastSpy = vi.spyOn(sonner.toast, 'message').mockImplementation(() => 'id')
    mswServer.use(
      http.post('http://api.test/me/builder-composer-hint', async () =>
        HttpResponse.json({
          headline: 'H',
          input_placeholder: 'P',
        }),
      ),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter initialEntries={['/']}>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/"
              element={
                <BuilderHomeComposer
                  profile={editorProfile()}
                  studioId="s1"
                  softwareId="sw1"
                  projectId={null}
                  projectName={null}
                  softwareName="SW"
                  canUseSoftwareChat
                  canSeeComposerHint
                />
              }
            />
            <Route path="/else" element={<div data-testid="x">x</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.getByPlaceholderText('P')).toBeInTheDocument(),
    )
    await user.type(screen.getByPlaceholderText('P'), '/help')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    expect(screen.queryByTestId('x')).not.toBeInTheDocument()
    toastSpy.mockRestore()
  })
})
