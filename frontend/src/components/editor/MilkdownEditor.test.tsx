import { render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { MilkdownEditorApi } from './MilkdownEditor'
import { MilkdownEditor } from './MilkdownEditor'

function renderEditor(markdown: string): ReactElement {
  const ref = createRef<MilkdownEditorApi>()
  return (
    <MilkdownEditor
      ref={ref}
      collab={null}
      defaultMarkdown={markdown}
      readOnly
    />
  )
}

describe('MilkdownEditor', () => {
  it(
    'clears loading overlay after editor mounts (no Milkdown/loading deadlock)',
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
})
