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
})
