import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ChatRoom } from './ChatRoom'
import { mswServer } from '../../test-setup'
import * as ws from '../../services/ws'

const STUDIO_ID = 'st1'

describe('ChatRoom', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeAll(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('includes selected model on send when multiple models are allowed', async () => {
    mswServer.use(
      http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
        HttpResponse.json({
          effective_model: 'gpt-4o-mini',
          workspace_default_model: 'gpt-4o-mini',
          allowed_models: ['gpt-4o-mini', 'gpt-4o'],
        }),
      ),
      http.get('http://api.test/projects/p1/chat', () =>
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
    vi.spyOn(ws, 'openProjectChatWebSocket').mockImplementation(() => {
      queueMicrotask(() => fakeWs.onopen?.())
      return fakeWs as unknown as WebSocket
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChatRoom projectId="p1" studioId={STUDIO_ID} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const modelSelect = await screen.findByLabelText('Project chat model')
    await user.selectOptions(modelSelect, 'gpt-4o')
    await user.type(screen.getByPlaceholderText(/project/), 'hello project')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'user_message',
        content: 'hello project',
        model: 'gpt-4o',
      }),
    )
  })

  it('clears streaming buffer and shows alert when server sends error after tokens', async () => {
    mswServer.use(
      http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
        HttpResponse.json({
          effective_model: 'gpt-4o-mini',
          workspace_default_model: 'gpt-4o-mini',
          allowed_models: ['gpt-4o-mini'],
        }),
      ),
      http.get('http://api.test/projects/p1/chat', () =>
        HttpResponse.json({ messages: [], next_before: null }),
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
    vi.spyOn(ws, 'openProjectChatWebSocket').mockImplementation(() => {
      queueMicrotask(() => fakeWs.onopen?.())
      return fakeWs as unknown as WebSocket
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChatRoom projectId="p1" studioId={STUDIO_ID} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByPlaceholderText(/project/)
    await act(async () => {
      fakeWs.onmessage?.({
        data: JSON.stringify({ type: 'assistant_token', text: 'partial' }),
      })
    })
    expect(await screen.findByText('partial')).toBeInTheDocument()
    await act(async () => {
      fakeWs.onmessage?.({
        data: JSON.stringify({
          type: 'error',
          message: 'LLM unavailable',
          code: 'LLM_UPSTREAM_TEST',
        }),
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('partial')).not.toBeInTheDocument()
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('LLM unavailable')
  })

  it('opens LLM outbound prompt overlay when assistant_done includes llm_outbound_messages', async () => {
    let chatFetch = 0
    mswServer.use(
      http.get(`http://api.test/studios/${STUDIO_ID}/llm-chat-models`, () =>
        HttpResponse.json({
          effective_model: 'gpt-4o-mini',
          workspace_default_model: 'gpt-4o-mini',
          allowed_models: ['gpt-4o-mini'],
        }),
      ),
      http.get('http://api.test/projects/p1/chat', () => {
        chatFetch += 1
        if (chatFetch === 1) {
          return HttpResponse.json({ messages: [], next_before: null })
        }
        return HttpResponse.json({
          messages: [
            {
              id: 'msg-asst-1',
              project_id: 'p1',
              user_id: null,
              role: 'assistant',
              content: 'Done reply',
              created_at: '2026-01-15T12:00:00Z',
            },
          ],
          next_before: null,
        })
      }),
    )
    const fakeWs = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      onopen: null as (() => void) | null,
      onmessage: null as ((ev: { data: string }) => void) | null,
      onclose: null as (() => void) | null,
    }
    vi.spyOn(ws, 'openProjectChatWebSocket').mockImplementation(() => {
      queueMicrotask(() => fakeWs.onopen?.())
      return fakeWs as unknown as WebSocket
    })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChatRoom projectId="p1" studioId={STUDIO_ID} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByPlaceholderText(/project/)
    await act(async () => {
      fakeWs.onmessage?.({
        data: JSON.stringify({
          type: 'assistant_done',
          message_id: 'msg-asst-1',
          content: 'Done reply',
          llm_outbound_messages: [
            { role: 'system', content: 'SYS-BODY-UNIQUE', tokens: 10 },
            { role: 'user', content: 'USER-BODY-UNIQUE', tokens: 20 },
          ],
        }),
      })
    })
    expect(await screen.findByText('30 tok')).toBeInTheDocument()
    const promptBtn = await screen.findByRole('button', {
      name: 'View LLM prompt',
    })
    await user.click(promptBtn)
    expect(screen.getByText('LLM outbound messages')).toBeInTheDocument()
    expect(screen.getAllByText('30 tok').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('· 10 tok')).toBeInTheDocument()
    expect(screen.getByText('· 20 tok')).toBeInTheDocument()
    expect(screen.getByText('SYS-BODY-UNIQUE')).toBeInTheDocument()
    expect(screen.getByText('USER-BODY-UNIQUE')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close prompt overlay' }))
    await waitFor(() => {
      expect(screen.queryByText('SYS-BODY-UNIQUE')).not.toBeInTheDocument()
    })
  })
})
