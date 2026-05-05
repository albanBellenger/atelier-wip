import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dot } from '../atoms/Dot'
import { Kbd } from '../atoms/Kbd'

describe('atoms', () => {
  it('Dot renders with color', () => {
    render(<Dot color="#ff0000" title="t" />)
    expect(document.querySelector('span[style]')).toBeTruthy()
  })

  it('Kbd renders children', () => {
    render(<Kbd>K</Kbd>)
    expect(screen.getByText('K')).toBeInTheDocument()
  })
})
