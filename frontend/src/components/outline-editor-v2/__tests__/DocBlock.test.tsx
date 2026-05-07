import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DocBlock } from '../canvas/DocBlock'

describe('DocBlock', () => {
  it('renders ul and calls onSelect', async () => {
    const onSelect = vi.fn()
    render(
      <DocBlock
        block={{ id: 'u1', type: 'ul', items: ['a', 'b'] }}
        onSelect={onSelect}
      />,
    )
    const el = screen.getByTestId('doc-block-u1')
    el.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    )
    expect(onSelect).toHaveBeenCalledWith('u1')
  })

  it('renders GFM table markdown as an HTML table and calls onSelect', async () => {
    const onSelect = vi.fn()
    const md = '| Col A | Col B |\n|-------|-------|\n| **x** | y |\n'
    render(
      <DocBlock
        block={{ id: 't1', type: 'table', markdown: md }}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Col A' })).toBeInTheDocument()
    const wrap = screen.getByTestId('doc-block-t1')
    wrap.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    )
    expect(onSelect).toHaveBeenCalledWith('t1')
  })
})
