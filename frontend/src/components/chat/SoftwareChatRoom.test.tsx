import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const STUDIO_ID = 'st1'

function useEmptyStudioChatModels(): void {
  mswServer.use(
    http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
      HttpResponse.json({
        effective_model: null,
        workspace_default_model: null,
        allowed_models: [],
      }),
    ),
  )
}

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

  it('shows poster display name on user messages when API provides it', async () => {
    useEmptyStudioChatModels()
    mswServer.use(
      http.get('http://api.test/software/sw1/chat', () =>
        HttpResponse.json({
          messages: [
            {
              id: 'm1',
              software_id: 'sw1',
              user_id: 'u1',
              role: 'user',
              content: 'Hello team',
              created_at: '2026-01-01T00:00:00Z',
              user_display_name: 'Jordan Lee',
            },
          ],
          next_before: null,
        }),
      ),
    )
    const fakeWs = {
      readyState: 1,
      send: vi.fn(),
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
            <Route
              path="/"
              element={<SoftwareChatRoom softwareId="sw1" studioId={STUDIO_ID} />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Jordan Lee')).toBeInTheDocument()
    expect(screen.getByText('Hello team')).toBeInTheDocument()
  })

  it('loads empty history from API', async () => {
    useEmptyStudioChatModels()
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
            <Route
              path="/"
              element={<SoftwareChatRoom softwareId="sw1" studioId={STUDIO_ID} />}
            />
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
    useEmptyStudioChatModels()
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
            <Route
              path="/"
              element={<SoftwareChatRoom softwareId="sw1" studioId={STUDIO_ID} />}
            />
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
      http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
        HttpResponse.json({
          effective_model: 'gpt-4o',
          workspace_default_model: 'gpt-4o',
          allowed_models: ['gpt-4o', 'gpt-4o-mini'],
        }),
      ),
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
            <Route
              path="/"
              element={<SoftwareChatRoom softwareId="sw1" studioId={STUDIO_ID} />}
            />
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

  it('includes selected model on manual send when multiple models are allowed', async () => {
    mswServer.use(
      http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
        HttpResponse.json({
          effective_model: 'gpt-4o-mini',
          workspace_default_model: 'gpt-4o-mini',
          allowed_models: ['gpt-4o-mini', 'gpt-4o'],
        }),
      ),
      http.get('http://api.test/software/sw1/chat', () =>
        HttpResponse.json({ messages: [], next_before: null }),
      ),
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
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/"
              element={<SoftwareChatRoom softwareId="sw1" studioId={STUDIO_ID} />}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const modelSelect = await screen.findByLabelText('Software chat model')
    await user.selectOptions(modelSelect, 'gpt-4o')
    await user.type(screen.getByPlaceholderText(/software team/), 'hello room')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'user_message',
        content: 'hello room',
        model: 'gpt-4o',
      }),
    )
  })
})
