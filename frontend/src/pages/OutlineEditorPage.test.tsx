import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { OutlineEditorPage } from './OutlineEditorPage'

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/ui/outline-editor']}>
      <Routes>
        <Route path="/ui/outline-editor" element={<OutlineEditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OutlineEditorPage', () => {
  it('renders section chrome, health rail, and composer copy from the outline editor spec', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /golden copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /drift metric/i })).toBeInTheDocument()
    expect(screen.getByText('2,535 / 6,000')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/ask the copilot, or type \/ for commands/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/no selection — copilot will operate on the whole section/i),
    ).toBeInTheDocument()
  })

  it('toggles health drawer open and closed', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /drift metric/i }))
    expect(screen.getByRole('button', { name: /close ✕/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close ✕/i }))
    expect(screen.queryByRole('button', { name: /close ✕/i })).not.toBeInTheDocument()
  })

  it('viewer-style surface: no admin console entry points on this demo page', () => {
    renderPage()
    expect(screen.queryByRole('link', { name: /admin console/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /token usage/i })).not.toBeInTheDocument()
  })
})
