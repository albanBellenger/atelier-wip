import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Y from 'yjs'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import type { YjsCollab } from '../../hooks/useYjsCollab'
import * as api from '../../services/api'
import type { PrivateThreadStreamMeta } from '../../services/privateThreadSse'
import { ThreadPanel } from './ThreadPanel'

const { streamSpy } = vi.hoisted(() => ({
  streamSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../hooks/useStream', () => ({
  useStream: () => ({ streamPrivateThread: streamSpy }),
}))

describe('ThreadPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    streamSpy.mockReset()
    streamSpy.mockResolvedValue(undefined)
  })

  beforeEach(() => {
    vi.spyOn(api, 'improveSection').mockResolvedValue({
      improved_markdown: '## Proposed\n',
    })
  })

  it('New thread calls reset, refetches empty messages', async () => {
    const user = userEvent.setup()
    const scroll = vi.fn()
    // jsdom: scrollIntoView is not implemented
    HTMLElement.prototype.scrollIntoView = scroll
    let fetchN = 0
    vi.spyOn(api, 'getPrivateThread').mockImplementation(async () => {
      fetchN += 1
      if (fetchN === 1) {
        return {
          thread_id: 'th-1',
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'first',
              created_at: new Date().toISOString(),
            },
            {
              id: 'm2',
              role: 'assistant',
              content: 'second',
              created_at: new Date().toISOString(),
            },
          ],
        }
      }
      return { thread_id: 'th-2', messages: [] }
    })
    const resetSpy = vi
      .spyOn(api, 'resetPrivateThread')
      .mockResolvedValue(undefined)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            projectId="p1"
            sectionId="sec1"
            sectionTitle="Intro"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('first')).toBeInTheDocument()
    })
    expect(screen.getByText('second')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New thread' }))

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith('p1', 'sec1')
    })
    await waitFor(() => {
      expect(screen.queryByText('first')).not.toBeInTheDocument()
    })
  })

  it('Send includes selection bounds when include selection is on', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    streamSpy.mockClear()

    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })

    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('t')
    ytext.insert(0, 'abcdef')
    const collab = {
      ydoc,
      provider: {} as YjsCollab['provider'],
      ytext,
      awareness: {} as YjsCollab['awareness'],
    }

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            projectId="p1"
            sectionId="sec1"
            sectionTitle="Intro"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={collab}
            editorSelection={{ from: 1, to: 3, text: 'bc' }}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Selection: 2 chars')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/Ask about/), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(streamSpy).toHaveBeenCalled()
    })
    const [, , payload] = streamSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      unknown,
    ]
    expect(payload.selection_from).toBe(1)
    expect(payload.selection_to).toBe(3)
    expect(payload.selected_plaintext).toBe('bc')
    expect(payload.current_section_plaintext).toBe('abcdef')
  })

  it('Apply is disabled when document drifted after proposal', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    streamSpy.mockImplementation(
      async (
        _p: string,
        _s: string,
        _payload: unknown,
        handlers: {
          onToken: (t: string) => void
          onMeta: (m: PrivateThreadStreamMeta) => void
        },
      ) => {
        handlers.onToken('ok')
        handlers.onMeta({
          findings: [],
          conflicts: [],
          patch_proposal: {
            intent: 'append',
            markdown_to_append: 'tail',
          },
        })
      },
    )

    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })

    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('t')
    ytext.insert(0, 'snap')
    const collab = {
      ydoc,
      provider: {} as YjsCollab['provider'],
      ytext,
      awareness: {} as YjsCollab['awareness'],
    }

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            projectId="p1"
            sectionId="sec1"
            sectionTitle="Intro"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={collab}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.selectOptions(screen.getByLabelText('Intent'), 'append')
    await user.type(screen.getByPlaceholderText(/Ask about/), 'go')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText('Patch proposal')).toBeInTheDocument()
    })

    await act(async () => {
      ytext.delete(0, ytext.length)
      ytext.insert(0, 'changed')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply to editor' })).toBeDisabled()
    })
  })

  it('Context tab fetches context preview', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })
    const previewSpy = vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [
        {
          label: 'Software definition',
          kind: 'software_def',
          tokens: 1,
          relevance: null,
          truncated: false,
          body: 'x',
        },
      ],
      total_tokens: 1,
      budget_tokens: 6000,
      overflow_strategy_applied: null,
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            projectId="p1"
            sectionId="sec1"
            sectionTitle="Intro"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('tab', { name: 'Context' }))

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledWith(
        'p1',
        'sec1',
        expect.objectContaining({ includeGitHistory: false }),
      )
    })
    await waitFor(() => {
      expect(
        screen.getByTestId('context-block-kind-software_def'),
      ).toBeInTheDocument()
    })
  })

  it('Critique tab requests section-scoped issues and work orders', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })
    const li = vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
    const lw = vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            projectId="p1"
            sectionId="sec1"
            sectionTitle="Intro"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('tab', { name: 'Critique' }))

    await waitFor(() => {
      expect(li).toHaveBeenCalledWith('p1', { sectionId: 'sec1' })
    })
    await waitFor(() => {
      expect(lw).toHaveBeenCalledWith('p1', { section_id: 'sec1' })
    })
  })

  it('Slash /improve sends command and forces ask intent', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    streamSpy.mockClear()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            projectId="p1"
            sectionId="sec1"
            sectionTitle="Intro"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.type(
      screen.getByPlaceholderText(/Ask about/),
      '/improve tighten doc',
    )
    expect(screen.getByTestId('slash-command-chip')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(streamSpy).toHaveBeenCalled()
    })
    const [, , payload] = streamSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload.command).toBe('improve')
    expect(payload.content).toBe('tighten doc')
    expect(payload.thread_intent).toBe('ask')
  })
})
