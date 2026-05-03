import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SectionLayoutSwitcher } from './SectionLayoutSwitcher'

describe('SectionLayoutSwitcher', () => {
  it('renders four segments with Markdown, Preview, Split, and Focus labels', () => {
    const onChange = vi.fn()
    render(<SectionLayoutSwitcher mode="split" onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Split' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Focus/ })).toBeInTheDocument()
  })

  it('marks the active segment with aria-selected true', () => {
    const onChange = vi.fn()
    render(<SectionLayoutSwitcher mode="preview" onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('calls onChange with the correct mode when each segment is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SectionLayoutSwitcher mode="markdown" onChange={onChange} />)
    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(onChange).toHaveBeenCalledWith('preview')
    await user.click(screen.getByRole('tab', { name: 'Split' }))
    expect(onChange).toHaveBeenCalledWith('split')
    await user.click(screen.getByRole('tab', { name: /Focus/ }))
    expect(onChange).toHaveBeenCalledWith('focus')
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    expect(onChange).toHaveBeenCalledWith('markdown')
  })
})
