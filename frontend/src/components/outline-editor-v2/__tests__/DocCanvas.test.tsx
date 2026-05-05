import { render, screen } from '@testing-library/react'
import * as Y from 'yjs'
import { afterEach, describe, expect, it } from 'vitest'

import { YDOC_TEXT_FIELD } from '../../../services/ws'
import { DocCanvas } from '../canvas/DocCanvas'

function makeYtext(s: string): Y.Text {
  const d = new Y.Doc()
  const t = d.getText(YDOC_TEXT_FIELD)
  t.insert(0, s)
  return t
}

describe('DocCanvas', () => {
  afterEach(() => {
    /* ydocs gc'd */
  })

  it('renders doc canvas in WYSIWYG mode with blocks', () => {
    const ytext = makeYtext('## Title\n\nBody.')
    render(
      <DocCanvas
        ytext={ytext}
        blocks={[
          { id: 'b1', type: 'h2', text: 'Title' },
          { id: 'b2', type: 'p', text: 'Body.' },
        ]}
        annotations={{}}
        displayRaw={false}
        patchOverlay={null}
        selectedBlockId={null}
        onSelectBlock={() => {}}
      />,
    )
    expect(screen.getByTestId('doc-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('doc-block-b1')).toHaveTextContent('Title')
  })

  it('renders raw markdown editor when displayRaw', () => {
    const ytext = makeYtext('## Hi')
    render(
      <DocCanvas
        ytext={ytext}
        blocks={[]}
        displayRaw={true}
        selectedBlockId={null}
        onSelectBlock={() => {}}
      />,
    )
    expect(screen.getByTestId('raw-markdown-editor')).toBeInTheDocument()
  })
})
