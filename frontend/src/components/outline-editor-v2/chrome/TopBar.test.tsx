import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('does not offer rename when rename prop is omitted', () => {
    render(
      <TopBar title="Alpha" slug="alpha" trailing={<span>t</span>} />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alpha')
    expect(screen.queryByTestId('topbar-rename-open')).not.toBeInTheDocument()
  })

  it('opens rename form and calls onSave with changed fields', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <TopBar
        title="Alpha"
        slug="alpha"
        rename={{ isSaving: false, onSave }}
      />,
    )
    await user.click(screen.getByTestId('topbar-rename-open'))
    await user.clear(screen.getByTestId('topbar-rename-title'))
    await user.type(screen.getByTestId('topbar-rename-title'), 'Beta')
    await user.clear(screen.getByTestId('topbar-rename-slug'))
    await user.type(screen.getByTestId('topbar-rename-slug'), 'beta')
    await user.click(screen.getByTestId('topbar-rename-save'))
    expect(onSave).toHaveBeenCalledWith({ title: 'Beta', slug: 'beta' })
    expect(screen.queryByTestId('topbar-rename-title')).not.toBeInTheDocument()
  })

  it('does not call onSave when nothing changed', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <TopBar title="Alpha" slug="alpha" rename={{ isSaving: false, onSave }} />,
    )
    await user.click(screen.getByTestId('topbar-rename-open'))
    await user.click(screen.getByTestId('topbar-rename-save'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('topbar-rename-title')).toBeInTheDocument()
  })

  it('sends only title when slug is unchanged', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <TopBar title="Alpha" slug="alpha" rename={{ isSaving: false, onSave }} />,
    )
    await user.click(screen.getByTestId('topbar-rename-open'))
    await user.clear(screen.getByTestId('topbar-rename-title'))
    await user.type(screen.getByTestId('topbar-rename-title'), 'Beta')
    await user.click(screen.getByTestId('topbar-rename-save'))
    expect(onSave).toHaveBeenCalledWith({ title: 'Beta' })
  })

  it('requires a non-empty slug before save', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <TopBar title="Alpha" slug="alpha" rename={{ isSaving: false, onSave }} />,
    )
    await user.click(screen.getByTestId('topbar-rename-open'))
    await user.clear(screen.getByTestId('topbar-rename-slug'))
    await user.click(screen.getByTestId('topbar-rename-save'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Slug cannot be empty.')).toBeInTheDocument()
  })

  it('cancels rename without calling onSave', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <TopBar title="Alpha" slug="alpha" rename={{ isSaving: false, onSave }} />,
    )
    await user.click(screen.getByTestId('topbar-rename-open'))
    await user.type(screen.getByTestId('topbar-rename-title'), ' X')
    await user.click(screen.getByTestId('topbar-rename-cancel'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alpha')
  })

  it('shows error when onSave rejects', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new Error('fail'))
    render(
      <TopBar title="Alpha" slug="alpha" rename={{ isSaving: false, onSave }} />,
    )
    await user.click(screen.getByTestId('topbar-rename-open'))
    await user.clear(screen.getByTestId('topbar-rename-title'))
    await user.type(screen.getByTestId('topbar-rename-title'), 'Beta')
    await user.click(screen.getByTestId('topbar-rename-save'))
    expect(
      await screen.findByText('Could not save changes.'),
    ).toBeInTheDocument()
  })
})
