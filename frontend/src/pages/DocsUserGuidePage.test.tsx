import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../services/api'
import { DocsUserGuidePage } from './DocsUserGuidePage'

afterEach(() => {
  vi.restoreAllMocks()
})

const memberMe: api.MeResponse = {
  user: {
    id: 'u1',
    email: 'a@b.com',
    display_name: 'Alex',
    is_platform_admin: false,
  },
  studios: [{ studio_id: 's1', studio_name: 'S', role: 'studio_member' }],
  cross_studio_grants: [],
}

describe('DocsUserGuidePage', () => {
  it('renders documentation shell and markdown from bundled mock file', async () => {
    vi.spyOn(api, 'listMeNotifications').mockResolvedValue({
      items: [],
      next_cursor: null,
    })
    vi.spyOn(api, 'me').mockResolvedValue(memberMe)

    render(
      <MemoryRouter initialEntries={['/docs/builder']}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Routes>
            <Route path="/docs/builder" element={<DocsUserGuidePage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^documentation$/i }),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /^atelier$/i })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: /^S$/i })).toHaveAttribute(
      'href',
      '/studios/s1',
    )
    expect(
      screen.getByRole('banner'),
    ).toHaveTextContent('Documentation')
    expect(screen.getByText(/Atelier · Builder workspace/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /back to home/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /atelier.*builder guide/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Mock source:/i)).toBeInTheDocument()
  })
})
