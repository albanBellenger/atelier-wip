import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Annotation } from '../annotations/useAnnotations'
import { MarginDot } from '../canvas/MarginDot'

describe('MarginDot', () => {
  it('renders annotation glyphs for provided annotations', () => {
    const anns: Annotation[] = [
      { id: 'a1', kind: 'gap', label: 'g' },
    ]
    render(<MarginDot annotations={anns} />)
    expect(screen.getByTestId('margin-dot')).toBeInTheDocument()
  })

  it('renders nothing in glyph stack when no annotations', () => {
    render(<MarginDot annotations={[]} />)
    expect(screen.getByTestId('margin-dot')).toBeInTheDocument()
  })
})
