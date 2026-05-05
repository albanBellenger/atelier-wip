import type { ReactElement } from 'react'

import type { AnnotationMap } from '../annotations/useAnnotations'
import type { DocBlock as DocBlockModel } from '../hooks/useDocBlocks'
import { DocBlock } from './DocBlock'
import { MarginDot } from './MarginDot'
import { MarginGutter } from './MarginGutter'
import { RawMarkdown } from './RawMarkdown'
import { SuggestionBlock } from './SuggestionBlock'
import type { SectionPatchOverlayState } from '../../../lib/sectionPatchOverlay'

export function DocCanvas(props: {
  ytext: import('yjs').Text
  blocks: DocBlockModel[]
  annotations: AnnotationMap
  displayRaw: boolean
  patchOverlay: SectionPatchOverlayState | null
  selectedBlockId: string | null
  onSelectBlock: (id: string | null) => void
}): ReactElement {
  const {
    ytext,
    blocks,
    annotations,
    displayRaw,
    patchOverlay,
    selectedBlockId,
    onSelectBlock,
  } = props

  if (displayRaw) {
    return (
      <div data-testid="doc-canvas" className="min-h-0 flex-1 overflow-auto">
        <RawMarkdown ytext={ytext} />
      </div>
    )
  }

  return (
    <div
      data-testid="doc-canvas"
      className="outline-editor-shell min-h-0 flex-1 overflow-auto px-2 py-4"
    >
      <SuggestionBlock overlay={patchOverlay} />
      <div className="mx-auto max-w-3xl space-y-1">
        {blocks.map((block) => (
          <div key={block.id} className="flex gap-0">
            <MarginGutter>
              <MarginDot annotations={annotations[block.id]} />
            </MarginGutter>
            <div className="min-w-0 flex-1">
              <DocBlock
                block={block}
                selected={selectedBlockId === block.id}
                onSelect={(id) => onSelectBlock(id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
