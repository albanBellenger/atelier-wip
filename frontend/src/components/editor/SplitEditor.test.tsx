import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { YjsCollab } from '../../hooks/useYjsCollab'
import type { SectionPatchOverlayState } from '../../lib/sectionPatchOverlay'
import { SplitEditor } from './SplitEditor'

function minimalCollab(content: string): YjsCollab {
  const ydoc = new Y.Doc()
  const ytext = ydoc.getText('t')
  ytext.insert(0, content)
  return {
    ydoc,
    provider: {} as YjsCollab['provider'],
    ytext,
    awareness: {
      clientID: 0,
      getStates: () => new Map(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as YjsCollab['awareness'],
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

  it('renders editor view tablist with Markdown, Preview, Split', () => {
    const collab = minimalCollab('# Hello')
    render(<SplitEditor collab={collab} />)
    expect(
      screen.getByRole('tablist', { name: 'Editor view' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tab', { name: 'Split' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('renders markdown preview with headings and paragraphs (not a single flat text block)', () => {
    const collab = minimalCollab('# Section title\n\nBody paragraph.')
    render(<SplitEditor collab={collab} />)
    const preview = screen.getByTestId('markdown-preview')
    expect(
      within(preview).getByRole('heading', {
        level: 1,
        name: 'Section title',
      }),
    ).toBeInTheDocument()
    expect(within(preview).getByText('Body paragraph.')).toBeInTheDocument()
  })

  it('switches to preview-only: hides CodeMirror host, shows markdown preview', async () => {
    const user = userEvent.setup()
    const collab = minimalCollab('# Hi')
    render(<SplitEditor collab={collab} />)
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.queryByTestId('codemirror-host')).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
  })

  it('switches to markdown-only: hides preview pane', async () => {
    const user = userEvent.setup()
    const collab = minimalCollab('x')
    render(<SplitEditor collab={collab} />)
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    expect(screen.getByTestId('codemirror-host')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
  })

  it('controlled mode hides the internal tablist when viewMode and onViewModeChange are passed', () => {
    const collab = minimalCollab('# Hello')
    const onViewModeChange = vi.fn()
    render(
      <SplitEditor
        collab={collab}
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
    const collab = minimalCollab('# Hello')
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
    const collab = minimalCollab('# Hello')
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
