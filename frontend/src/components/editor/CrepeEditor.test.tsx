import { render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactElement } from 'react'
import type { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { describe, expect, it, vi } from 'vitest'

import type { EditorView } from '@milkdown/prose/view'

import type { YjsCollab } from '../../hooks/useYjsCollab'
import {
  EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY,
  writeEditorBlockHandleFirstRunDone,
} from '../../lib/editorBlockHandleOnboarding'
import type { CrepeEditorApi } from './CrepeEditor'
import {
  CrepeEditor,
  EMPTY_SECTION_EDITOR_PLACEHOLDER,
  pmSelectionToEditorState,
} from './CrepeEditor'

function mkTestCollab(sendMarkdownSnapshot: ReturnType<typeof vi.fn>): YjsCollab {
  return {
    ydoc: new Y.Doc(),
    provider: {} as WebsocketProvider,
    awareness: {} as WebsocketProvider['awareness'],
    sendMarkdownSnapshot,
  }
}

function renderEditor(markdown: string): ReactElement {
  const ref = createRef<CrepeEditorApi>()
  return (
    <CrepeEditor
      ref={ref}
      collab={null}
      defaultMarkdown={markdown}
      readOnly
    />
  )
}

function renderEditableEditor(markdown: string): ReactElement {
  const ref = createRef<CrepeEditorApi>()
  return (
    <CrepeEditor ref={ref} collab={null} defaultMarkdown={markdown} readOnly={false} />
  )
}

describe('pmSelectionToEditorState', () => {
  it('returns null when view is undefined (Crepe can fire before editorViewCtx exists)', () => {
    expect(pmSelectionToEditorState(undefined, '# Hello')).toBeNull()
  })

  it('returns null when view.state is missing', () => {
    const view = { state: undefined } as unknown as EditorView
    expect(pmSelectionToEditorState(view, '')).toBeNull()
  })
})

describe('CrepeEditor', () => {
  it(
    'clears loading overlay after editor mounts',
    async () => {
      render(renderEditor('# Hello'))

      await waitFor(
        () => {
          expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
        },
        { timeout: 15_000 },
      )

      expect(await screen.findByText('Hello', {}, { timeout: 15_000 })).toBeInTheDocument()
    },
    20_000,
  )

  it(
    'shows the empty-section placeholder on an editable blank document',
    async () => {
      const { container } = render(renderEditableEditor(''))

      await waitFor(
        () => {
          expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
        },
        { timeout: 15_000 },
      )

      await waitFor(
        () => {
          const found = [...container.querySelectorAll('[data-placeholder]')].some(
            (el) => el.getAttribute('data-placeholder') === EMPTY_SECTION_EDITOR_PLACEHOLDER,
          )
          expect(found).toBe(true)
        },
        { timeout: 15_000 },
      )
    },
    20_000,
  )

  it(
    'does not show the editable empty-section placeholder when read-only',
    async () => {
      const { container } = render(renderEditor(''))

      await waitFor(
        () => {
          expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
        },
        { timeout: 15_000 },
      )

      expect(
        [...container.querySelectorAll('[data-placeholder]')].some(
          (el) => el.getAttribute('data-placeholder') === EMPTY_SECTION_EDITOR_PLACEHOLDER,
        ),
      ).toBe(false)
    },
    20_000,
  )

  it(
    'does not show block-handle onboarding in read-only mode',
    async () => {
      window.localStorage.removeItem(EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY)
      render(
        <CrepeEditor
          ref={createRef<CrepeEditorApi>()}
          collab={null}
          defaultMarkdown="Hello"
          readOnly
        />,
      )
      await waitFor(
        () => expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument(),
        { timeout: 15_000 },
      )
      await new Promise((r) => setTimeout(r, 2000))
      expect(screen.queryByTestId('editor-block-onboarding-tooltip')).toBeNull()
    },
    22_000,
  )

  it(
    'does not show block-handle onboarding when the first-run flag is already set',
    async () => {
      window.localStorage.removeItem(EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY)
      writeEditorBlockHandleFirstRunDone()
      render(
        <CrepeEditor
          ref={createRef<CrepeEditorApi>()}
          collab={null}
          defaultMarkdown="Hello"
          readOnly={false}
        />,
      )
      await waitFor(
        () => expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument(),
        { timeout: 15_000 },
      )
      await new Promise((r) => setTimeout(r, 2000))
      expect(screen.queryByTestId('editor-block-onboarding-tooltip')).toBeNull()
    },
    22_000,
  )

  it(
    'flushes markdown snapshot on unmount when collab is present and editable',
    async () => {
      const sendMarkdownSnapshot = vi.fn()
      const collab = mkTestCollab(sendMarkdownSnapshot)
      const { unmount } = render(
        <CrepeEditor collab={collab} defaultMarkdown="# Flush me" readOnly={false} />,
      )
      await waitFor(
        () => {
          expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
        },
        { timeout: 15_000 },
      )
      unmount()
      expect(sendMarkdownSnapshot).toHaveBeenCalled()
      const sent = sendMarkdownSnapshot.mock.calls[0]?.[0] as string | undefined
      expect(sent).toBeDefined()
      expect(sent).toContain('Flush me')
    },
    20_000,
  )

  it(
    'flushes markdown snapshot on beforeunload when collab is present and editable',
    async () => {
      const sendMarkdownSnapshot = vi.fn()
      const collab = mkTestCollab(sendMarkdownSnapshot)
      render(<CrepeEditor collab={collab} defaultMarkdown="# Tab close" readOnly={false} />)
      await waitFor(
        () => {
          expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
        },
        { timeout: 15_000 },
      )
      window.dispatchEvent(new Event('beforeunload'))
      expect(sendMarkdownSnapshot).toHaveBeenCalled()
      const sent = sendMarkdownSnapshot.mock.calls[0]?.[0] as string | undefined
      expect(sent).toContain('Tab close')
    },
    20_000,
  )

  it('viewer (readOnly) does not send markdown snapshot on unmount', async () => {
    const sendMarkdownSnapshot = vi.fn()
    const collab = mkTestCollab(sendMarkdownSnapshot)
    const { unmount } = render(
      <CrepeEditor collab={collab} defaultMarkdown="# Secret" readOnly />,
    )
    await waitFor(
      () => {
        expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
      },
      { timeout: 15_000 },
    )
    unmount()
    expect(sendMarkdownSnapshot).not.toHaveBeenCalled()
  })

  it('viewer (readOnly) does not send markdown snapshot on beforeunload', async () => {
    const sendMarkdownSnapshot = vi.fn()
    const collab = mkTestCollab(sendMarkdownSnapshot)
    render(<CrepeEditor collab={collab} defaultMarkdown="# Secret" readOnly />)
    await waitFor(
      () => {
        expect(screen.queryByText('Loading editor…')).not.toBeInTheDocument()
      },
      { timeout: 15_000 },
    )
    window.dispatchEvent(new Event('beforeunload'))
    expect(sendMarkdownSnapshot).not.toHaveBeenCalled()
  })
})
