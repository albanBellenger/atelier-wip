import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { YjsCollab } from '../../hooks/useYjsCollab'
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
    } as YjsCollab['awareness'],
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
})
