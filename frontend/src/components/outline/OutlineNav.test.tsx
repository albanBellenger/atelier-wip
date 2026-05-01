import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { SectionSummary } from '../../services/api'
import { OutlineNav } from './OutlineNav'

function renderOutline(sections: SectionSummary[]): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <OutlineNav
          sections={sections}
          selectedSectionId={sections[0]?.id ?? null}
          isStudioAdmin={false}
          onSelect={() => {}}
          onDelete={() => {}}
          onReorder={() => {}}
          newTitle=""
          onNewTitleChange={() => {}}
          onAddSection={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('OutlineNav section status pills (Slice A)', () => {
  const base = (id: string, title: string, status: SectionSummary['status']): SectionSummary => ({
    id,
    title,
    slug: id,
    order: 0,
    status,
    updated_at: '2026-05-01T12:00:00.000Z',
  })

  it('renders ready pill (emerald)', () => {
    renderOutline([base('a1', 'Alpha', 'ready')])
    const pill = screen.getByTestId('section-status-pill-ready')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toMatch(/emerald/)
  })

  it('renders gaps pill (amber)', () => {
    renderOutline([base('b1', 'Beta', 'gaps')])
    const pill = screen.getByTestId('section-status-pill-gaps')
    expect(pill.className).toMatch(/amber/)
  })

  it('renders conflict pill (red)', () => {
    renderOutline([base('c1', 'Gamma', 'conflict')])
    const pill = screen.getByTestId('section-status-pill-conflict')
    expect(pill.className).toMatch(/red/)
  })

  it('renders empty pill (zinc)', () => {
    renderOutline([base('d1', 'Delta', 'empty')])
    const pill = screen.getByTestId('section-status-pill-empty')
    expect(pill.className).toMatch(/zinc/)
  })
})
