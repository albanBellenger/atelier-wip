import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RefObject } from 'react'
import * as Y from 'yjs'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import type { CrepeEditorApi } from '../editor/CrepeEditor'
import type { YjsCollab } from '../../hooks/useYjsCollab'
import * as api from '../../services/api'
import type {
  ContextPreview,
  PrivateThreadMessage,
  WorkOrderDetail,
} from '../../services/api'
import type { PrivateThreadStreamMeta } from '../../services/privateThreadSse'
import { softwareChatModelStorageKey } from '../../lib/softwareComposerNav'
import { CONTEXT_TRUNCATION_BANNER_COPY } from './ContextTruncationBanner'
import { ThreadPanel } from './ThreadPanel'

const { streamSpy } = vi.hoisted(() => ({
  streamSpy: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../hooks/useStream', () => ({
  useStream: () => ({ streamPrivateThread: streamSpy }),
}))

function mkSectionEditorApiRef(
  overrides: Partial<CrepeEditorApi> = {},
): RefObject<CrepeEditorApi | null> {
  return {
    current: {
      getEditorView: () => null,
      getMarkdown: () => '',
      replaceFullMarkdown: () => {},
      applyPatch: () => ({ ok: false, reason: 'noop' }),
      animateAppendFromMarkdown: () => Promise.resolve(),
      ...overrides,
    },
  }
}

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
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([])
    vi.spyOn(api, 'listProjectIssues').mockResolvedValue([])
    vi.spyOn(api, 'getContextPreview').mockResolvedValue({
      blocks: [],
      total_tokens: 0,
      budget_tokens: 8000,
      overflow_strategy_applied: null,
    })
    vi.spyOn(api, 'getLlmRuntimeInfo').mockResolvedValue({
      llm_provider: 'openai',
      llm_model: 'gpt-4o-mini',
    })
    vi.spyOn(api, 'getStudioChatLlmModels').mockResolvedValue({
      effective_model: null,
      workspace_default_model: null,
      allowed_models: [],
    })
  })

  it('shows studio chat model beside the composer when one model is allowed', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getStudioChatLlmModels').mockResolvedValue({
      effective_model: 'gpt-4o-mini',
      workspace_default_model: 'gpt-4o-mini',
      allowed_models: ['gpt-4o-mini'],
    })
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument()
    })
  })

  it('does not crash when awareness.getStates throws before collab is ready', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })
    const ydoc = new Y.Doc()
    const collab: YjsCollab = {
      ydoc,
      provider: {} as YjsCollab['provider'],
      sendMarkdownSnapshot: vi.fn(),
      awareness: {
        clientID: 0,
        getStates: () => {
          throw new TypeError(
            "Cannot read properties of undefined (reading 'states')",
          )
        },
      } as unknown as YjsCollab['awareness'],
    }
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={collab}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText(/Private · 1 collaborator/)).toBeInTheDocument()
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
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

  it('Send includes selected plaintext when include selection is on', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    streamSpy.mockClear()

    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })

    const ydoc = new Y.Doc()
    const collab: YjsCollab = {
      ydoc,
      provider: {} as YjsCollab['provider'],
      awareness: {} as YjsCollab['awareness'],
      sendMarkdownSnapshot: vi.fn(),
    }
    const sectionEditorApiRef = mkSectionEditorApiRef({
      getMarkdown: () => 'abcdef',
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={collab}
            sectionEditorApiRef={sectionEditorApiRef}
            editorSelection={{ from: 1, to: 3, text: 'bc' }}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Selection: 2 chars')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/copilot/), 'hello')
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
    expect(payload).not.toHaveProperty('selection_from')
    expect(payload).not.toHaveProperty('selection_to')
    expect(payload.selected_plaintext).toBe('bc')
    expect(payload.current_section_plaintext).toBe('abcdef')
  })

  it('Send includes preferred_model from studio chat picker selection', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    streamSpy.mockClear()
    vi.spyOn(api, 'getStudioChatLlmModels').mockResolvedValue({
      effective_model: 'gpt-4o-mini',
      workspace_default_model: 'gpt-4o-mini',
      allowed_models: ['gpt-4o-mini', 'gpt-4o'],
    })
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })

    const ydoc = new Y.Doc()
    const collab: YjsCollab = {
      ydoc,
      provider: {} as YjsCollab['provider'],
      awareness: {} as YjsCollab['awareness'],
      sendMarkdownSnapshot: vi.fn(),
    }

    window.localStorage.setItem(softwareChatModelStorageKey('s1'), 'gpt-4o')

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={collab}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Copilot chat model')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/copilot/), 'hello')
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
    expect(payload.preferred_model).toBe('gpt-4o')
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
            intent: 'edit',
            old_snippet: 'snap',
            new_snippet: 'snapX',
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
    const collab: YjsCollab = {
      ydoc,
      provider: {} as YjsCollab['provider'],
      awareness: {} as YjsCollab['awareness'],
      sendMarkdownSnapshot: vi.fn(),
    }
    const sectionEditorApiRef = mkSectionEditorApiRef({
      getMarkdown: () => ytext.toString(),
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={collab}
            sectionEditorApiRef={sectionEditorApiRef}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.type(screen.getByPlaceholderText(/copilot/), '/edit go')
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
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

  it('Slash /improve calls structured improve API (not chat stream)', async () => {
    const user = userEvent.setup({ delay: null })
    HTMLElement.prototype.scrollIntoView = vi.fn()
    streamSpy.mockClear()
    const improveSpy = vi.spyOn(api, 'improveSection').mockResolvedValue({
      improved_markdown: '## Better\n',
    })
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.type(
      screen.getByTestId('copilot-composer-textarea'),
      '/improve tighten doc',
    )
    expect(screen.getByTestId('slash-command-chip')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(improveSpy).toHaveBeenCalledWith(
        'p1',
        'sec1',
        expect.objectContaining({ instruction: 'tighten doc' }),
      )
    })
    expect(streamSpy).not.toHaveBeenCalled()
  })

  it('does not crash when work order detail omits notes (drift feed)', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })
    vi.spyOn(api, 'listWorkOrders').mockResolvedValue([
      {
        id: 'wo-1',
        project_id: 'p1',
        title: 'WO',
        description: '',
        implementation_guide: null,
        acceptance_criteria: null,
        status: 'backlog',
        phase: null,
        phase_order: null,
        assignee_id: null,
        assignee_display_name: null,
        is_stale: false,
        stale_reason: null,
        created_by: null,
        updated_by_id: null,
        updated_by_display_name: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        section_ids: ['sec1'],
      },
    ])
    vi.spyOn(api, 'getWorkOrder').mockResolvedValue({
      id: 'wo-1',
      project_id: 'p1',
      title: 'WO',
      description: '',
      implementation_guide: null,
      acceptance_criteria: null,
      status: 'backlog',
      phase: null,
      phase_order: null,
      assignee_id: null,
      assignee_display_name: null,
      is_stale: false,
      stale_reason: null,
      created_by: null,
      updated_by_id: null,
      updated_by_display_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      section_ids: ['sec1'],
    } as WorkOrderDetail)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('recent-updates-feed')).toBeInTheDocument()
    })
  })

  it('does not crash when context meter returns preview without blocks', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [],
    })
    vi.spyOn(api, 'getContextPreview').mockImplementation(
      async (_p, _s, opts) => {
        if (opts?.q != null && opts.q.length > 3) {
          return {
            total_tokens: 1,
            budget_tokens: 8000,
            overflow_strategy_applied: null,
          } as ContextPreview
        }
        return {
          blocks: [],
          total_tokens: 0,
          budget_tokens: 8000,
          overflow_strategy_applied: null,
        }
      },
    )

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await user.type(screen.getByPlaceholderText(/copilot/), 'hello')
    await waitFor(
      () => {
        expect(api.getContextPreview).toHaveBeenCalled()
      },
      { timeout: 4000 },
    )
    expect(screen.getByTestId('copilot-status-strip')).toBeInTheDocument()
  })

  it('autoscroll: bottom anchor scrollIntoView uses block end; smooth after messages grow', async () => {
    const scrollSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollSpy

    let messages: PrivateThreadMessage[] = [
      {
        id: 'm1',
        role: 'user',
        content: 'one',
        created_at: new Date().toISOString(),
      },
    ]
    const threadSpy = vi.spyOn(api, 'getPrivateThread').mockImplementation(
      async () => ({
        thread_id: 'th-1',
        messages,
      }),
    )

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('one')).toBeInTheDocument()
    })

    expect(scrollSpy).toHaveBeenCalled()
    expect(
      scrollSpy.mock.calls.some((call) => {
        const opts = call[0] as ScrollIntoViewOptions | undefined
        return opts?.block === 'end'
      }),
    ).toBe(true)
    expect(
      scrollSpy.mock.calls.some((call) => {
        const opts = call[0] as ScrollIntoViewOptions | undefined
        return opts?.behavior === 'auto'
      }),
    ).toBe(true)

    const callsAfterFirstPaint = scrollSpy.mock.calls.length

    messages = [
      ...messages,
      {
        id: 'm2',
        role: 'assistant',
        content: 'two',
        created_at: new Date().toISOString(),
      },
    ]
    threadSpy.mockImplementation(async () => ({
      thread_id: 'th-1',
      messages,
    }))

    await act(async () => {
      await qc.invalidateQueries({
        queryKey: ['privateThread', 'p1', 'sec1'],
      })
    })

    await waitFor(() => {
      expect(screen.getByText('two')).toBeInTheDocument()
    })
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstPaint)
    expect(
      scrollSpy.mock.calls.some((call) => {
        const opts = call[0] as ScrollIntoViewOptions | undefined
        return opts?.behavior === 'smooth'
      }),
    ).toBe(true)
  })

  it('Chat tab shows empty-state hint when thread has no messages', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Start a conversation with the copilot/),
      ).toBeInTheDocument()
    })
  })

  it('Chat tab shows You and Copilot labels for thread messages', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.spyOn(api, 'getPrivateThread').mockResolvedValue({
      thread_id: 'th-1',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'from user',
          created_at: new Date().toISOString(),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'from assistant',
          created_at: new Date().toISOString(),
        },
      ],
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('You')).toBeInTheDocument()
    })
    expect(screen.getByText('from user')).toBeInTheDocument()
    expect(screen.getByText('Copilot')).toBeInTheDocument()
    expect(screen.getByText('from assistant')).toBeInTheDocument()
    expect(screen.getByText('You').parentElement).toHaveClass('items-end')
  })

  it('focus density uses floating composer with slash chips and improve summary chip', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
            density="focus"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('copilot-composer-focus')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/Talk to the section copilot/)).toBeInTheDocument()
    })
    const focusComposer = screen.getByTestId('copilot-composer-focus')
    let card: Element | null = null
    for (const el of focusComposer.querySelectorAll('div')) {
      if (
        typeof el.className === 'string' &&
        el.className.includes('max-w-[760px]')
      ) {
        card = el
        break
      }
    }
    expect(card).not.toBeNull()
    expect(card?.className).toMatch(/rounded-2xl/)
    expect(card?.className).not.toMatch(/sticky/)
    expect(
      within(focusComposer).getByRole('button', { name: '/improve' }),
    ).toBeInTheDocument()
    expect(
      within(focusComposer).getByRole('button', { name: '/ask' }),
    ).toBeInTheDocument()
    expect(
      within(focusComposer).getByRole('button', { name: '/edit' }),
    ).toBeInTheDocument()
  })

  it('focus density scrollIntoView fires on load and when messages grow', async () => {
    const scrollSpy = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollSpy

    let messages: PrivateThreadMessage[] = [
      {
        id: 'm1',
        role: 'user',
        content: 'one',
        created_at: new Date().toISOString(),
      },
    ]
    const threadSpy = vi.spyOn(api, 'getPrivateThread').mockImplementation(
      async () => ({
        thread_id: 'th-1',
        messages,
      }),
    )

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThreadPanel
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
            density="focus"
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('one')).toBeInTheDocument()
    })
    expect(scrollSpy).toHaveBeenCalled()
    expect(
      scrollSpy.mock.calls.some((call) => {
        const opts = call[0] as ScrollIntoViewOptions | undefined
        return opts?.block === 'end'
      }),
    ).toBe(true)

    const callsAfterFirst = scrollSpy.mock.calls.length
    messages = [
      ...messages,
      {
        id: 'm2',
        role: 'assistant',
        content: 'two',
        created_at: new Date().toISOString(),
      },
    ]
    threadSpy.mockImplementation(async () => ({
      thread_id: 'th-1',
      messages,
    }))

    await act(async () => {
      await qc.invalidateQueries({
        queryKey: ['privateThread', 'p1', 'sec1'],
      })
    })

    await waitFor(() => {
      expect(screen.getByText('two')).toBeInTheDocument()
    })
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('shows context truncation banner when stream meta has context_truncated true', async () => {
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
        handlers.onMeta({
          findings: [],
          conflicts: [],
          context_truncated: true,
        })
      },
    )
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByPlaceholderText(/copilot/), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        CONTEXT_TRUNCATION_BANNER_COPY,
      )
    })
  })

  it('hides context truncation banner when a new send starts', async () => {
    const user = userEvent.setup()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    let n = 0
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
        n += 1
        if (n === 1) {
          handlers.onMeta({
            findings: [],
            conflicts: [],
            context_truncated: true,
          })
        } else {
          handlers.onMeta({
            findings: [],
            conflicts: [],
            context_truncated: false,
          })
        }
      },
    )
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
            studioId="s1"
            projectId="p1"
            sectionId="sec1"
            projectHref="/studios/s1/software/sw1/projects/p1"
            collab={null}
            sectionEditorApiRef={mkSectionEditorApiRef()}
            editorSelection={null}
            onClearEditorSelection={() => {}}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const composer = screen.getByPlaceholderText(/copilot/)
    await user.type(composer, 'first')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    await user.type(composer, 'second')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
