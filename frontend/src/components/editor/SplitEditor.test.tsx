import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { YjsCollab } from '../../hooks/useYjsCollab'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import { SplitEditor } from './SplitEditor'

vi.mock('./CrepeEditor', () => ({
  CrepeEditor: React.forwardRef(function MockCrepe(
    _props: Record<string, unknown>,
    ref: React.Ref<{ getMarkdown: () => string }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      getMarkdown: () => '',
      getEditorView: () => null,
      replaceFullMarkdown: vi.fn(),
      applyPatch: () => ({ ok: false, reason: 'mock' }),
      animateAppendFromMarkdown: () => Promise.resolve(),
    }))
    return React.createElement(
      'div',
      { 'data-testid': 'crepe-editor-inner' },
      'mock',
    )
  }),
}))

function minimalCollab(): YjsCollab {
  const ydoc = new Y.Doc()
  return {
    ydoc,
    provider: {
      ws: null,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as YjsCollab['provider'],
    awareness: {
      clientID: 0,
      getStates: () => new Map(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as YjsCollab['awareness'],
    sendMarkdownSnapshot: vi.fn(),
  }
}

function collabWithRemotePeer(): YjsCollab {
  const ydoc = new Y.Doc()
  const states = new Map<number, unknown>([
    [0, { user: { name: 'Local', color: 'hsl(0 70% 60%)', userId: 'loc' } }],
    [
      2,
      {
        user: {
          name: 'Taylor Quinn',
          color: '#ff0000',
          userId: 'remote-tq',
        },
      },
    ],
  ])
  return {
    ydoc,
    provider: {
      ws: null,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as YjsCollab['provider'],
    awareness: {
      clientID: 0,
      getStates: (): Map<number, unknown> => states,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as YjsCollab['awareness'],
    sendMarkdownSnapshot: vi.fn(),
  }
}

describe('SplitEditor', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows collaborator presence in the editor header when remotes are connected', () => {
    const collab = collabWithRemotePeer()
    render(<SplitEditor collab={collab} defaultMarkdown="# Hello" />)
    expect(screen.getByTitle('Taylor Quinn')).toHaveTextContent('TQ')
  })

  it('shows remote collaborator presence for read-only editors', () => {
    const collab = collabWithRemotePeer()
    render(
      <SplitEditor collab={collab} defaultMarkdown="# Hello" readOnly />,
    )
    expect(screen.getByTitle('Taylor Quinn')).toBeInTheDocument()
  })

  it('renders editor view tablist with Editor, Preview, Split', () => {
    const collab = minimalCollab()
    render(<SplitEditor collab={collab} defaultMarkdown="# Hello" />)
    expect(
      screen.getByRole('tablist', { name: 'Editor view' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Editor' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tab', { name: 'Split' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('renders markdown preview with headings and paragraphs (not a single flat text block)', async () => {
    const user = userEvent.setup()
    const collab = minimalCollab()
    const md = '# Section title\n\nBody paragraph.'
    render(<SplitEditor collab={collab} defaultMarkdown={md} />)
    await user.click(screen.getByRole('tab', { name: 'Split' }))
    const preview = screen.getByTestId('markdown-preview')
    expect(
      within(preview).getByRole('heading', {
        level: 1,
        name: 'Section title',
      }),
    ).toBeInTheDocument()
    expect(within(preview).getByText('Body paragraph.')).toBeInTheDocument()
  })

  it('switches to preview-only: hides Crepe host, shows markdown preview', async () => {
    const user = userEvent.setup()
    const collab = minimalCollab()
    render(<SplitEditor collab={collab} defaultMarkdown="# Hi" />)
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.queryByTestId('crepe-host')).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
  })

  it('switches to editor-only: hides preview pane', async () => {
    const user = userEvent.setup()
    const collab = minimalCollab()
    render(<SplitEditor collab={collab} defaultMarkdown="x" />)
    await user.click(screen.getByRole('tab', { name: 'Editor' }))
    expect(screen.getByTestId('crepe-host')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
  })

  it('controlled mode hides the internal tablist when viewMode and onViewModeChange are passed', () => {
    const collab = minimalCollab()
    const onViewModeChange = vi.fn()
    render(
      <SplitEditor
        collab={collab}
        defaultMarkdown="# Hello"
        viewMode="preview"
        onViewModeChange={onViewModeChange}
      />,
    )
    expect(
      screen.queryByRole('tablist', { name: 'Editor view' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
  })

  it('patch overlay Accept invokes onApply', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onDismiss = vi.fn()
    const collab = minimalCollab()
    const patchOverlay: SectionPatchOverlayState = {
      mergedMarkdown: '## Patched',
      canApply: true,
      blockedReason: null,
      onApply,
      onDismiss,
    }
    render(
      <SplitEditor
        collab={collab}
        defaultMarkdown="# Hello"
        viewMode="preview"
        onViewModeChange={vi.fn()}
        patchOverlay={patchOverlay}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('patch overlay Reject invokes onDismiss', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onDismiss = vi.fn()
    const collab = minimalCollab()
    const patchOverlay: SectionPatchOverlayState = {
      mergedMarkdown: '## Patched',
      canApply: true,
      blockedReason: null,
      onApply,
      onDismiss,
    }
    render(
      <SplitEditor
        collab={collab}
        defaultMarkdown="# Hello"
        viewMode="preview"
        onViewModeChange={vi.fn()}
        patchOverlay={patchOverlay}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })
})
