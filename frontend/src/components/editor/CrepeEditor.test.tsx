import { render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { CrepeEditorApi } from './CrepeEditor'
import { CrepeEditor } from './CrepeEditor'

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
})
