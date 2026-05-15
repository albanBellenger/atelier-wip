import { render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { EditorView } from '@milkdown/prose/view'

import {
  EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY,
  writeEditorBlockHandleFirstRunDone,
} from '../../lib/editorBlockHandleOnboarding'
import type { CrepeEditorApi } from './CrepeEditor'
import { CrepeEditor, pmSelectionToEditorState } from './CrepeEditor'

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
})
