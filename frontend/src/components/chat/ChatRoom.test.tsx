import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
})
