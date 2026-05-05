import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { SoftwareChatRoom } from './SoftwareChatRoom'
import {
  SOFTWARE_COMPOSER_CHAT_MODEL_KEY,
  SOFTWARE_COMPOSER_DRAFT_STATE_KEY,
} from '../../lib/softwareComposerNav'
import { mswServer } from '../../test-setup'
import * as ws from '../../services/ws'

describe('SoftwareChatRoom', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('loads empty history from API', async () => {
    mswServer.use(
      http.get('http://api.test/software/sw1/chat', ({ request }) => {
        const u = new URL(request.url)
        expect(u.searchParams.get('limit')).toBe('50')
        return HttpResponse.json({ messages: [], next_before: null })
      }),
    )
    const send = vi.fn()
    const fakeWs = {
      readyState: 1,
      send,
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onmessage: null as ((ev: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
    }
    vi.spyOn(ws, 'openSoftwareChatWebSocket').mockImplementation(() => {
      queueMicrotask(() => fakeWs.onopen?.())
      return fakeWs as unknown as WebSocket
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/" element={<SoftwareChatRoom softwareId="sw1" />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.queryByText('Loading messages…')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Software chat')).toBeInTheDocument()
  })

  it('auto-sends draft from location.state once WebSocket is open', async () => {
    mswServer.use(
      http.get('http://api.test/software/sw1/chat', () =>
        HttpResponse.json({ messages: [], next_before: null }),
      ),
    )
    const send = vi.fn()
    const fakeWs = {
      readyState: 0,
      send,
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onmessage: null as ((ev: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
    }
    vi.spyOn(ws, 'openSoftwareChatWebSocket').mockImplementation(() => {
      queueMicrotask(() => {
        fakeWs.readyState = 1
        fakeWs.onopen?.()
      })
      return fakeWs as unknown as WebSocket
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/',
            state: { [SOFTWARE_COMPOSER_DRAFT_STATE_KEY]: 'from home' },
          },
        ]}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/" element={<SoftwareChatRoom softwareId="sw1" />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'user_message', content: 'from home' }),
    )
  })

  it('auto-send includes model when location.state provides chat model key', async () => {
    mswServer.use(
      http.get('http://api.test/software/sw1/chat', () =>
        HttpResponse.json({ messages: [], next_before: null }),
      ),
    )
    const send = vi.fn()
    const fakeWs = {
      readyState: 0,
      send,
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onmessage: null as ((ev: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
    }
    vi.spyOn(ws, 'openSoftwareChatWebSocket').mockImplementation(() => {
      queueMicrotask(() => {
        fakeWs.readyState = 1
        fakeWs.onopen?.()
      })
      return fakeWs as unknown as WebSocket
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/',
            state: {
              [SOFTWARE_COMPOSER_DRAFT_STATE_KEY]: 'from home',
              [SOFTWARE_COMPOSER_CHAT_MODEL_KEY]: 'gpt-4o',
            },
          },
        ]}
      >
        <QueryClientProvider client={qc}>
          <Routes>
            <Route path="/" element={<SoftwareChatRoom softwareId="sw1" />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'user_message',
        content: 'from home',
        model: 'gpt-4o',
      }),
    )
  })
})
