import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { StudioTokenUsageRedirect } from './StudioTokenUsageRedirect'

function LlmUsageStub(): ReactElement {
  const [sp] = useSearchParams()
  return (
    <div>
      <span>LLM usage page</span>
      <span data-testid="studio-filter">{sp.get('studio_id')}</span>
      <span data-testid="has-dates">{sp.get('date_from') != null ? '1' : '0'}</span>
    </div>
  )
}

describe('StudioTokenUsageRedirect', () => {
  it('navigates to /llm-usage with studio_id and date bounds', async () => {
    render(
      <MemoryRouter initialEntries={['/studios/stu-uuid-1/token-usage']}>
        <Routes>
          <Route
            path="/studios/:studioId/token-usage"
            element={<StudioTokenUsageRedirect />}
          />
          <Route path="/llm-usage" element={<LlmUsageStub />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('LLM usage page')).toBeInTheDocument()
    expect(screen.getByTestId('studio-filter').textContent).toBe('stu-uuid-1')
    expect(screen.getByTestId('has-dates').textContent).toBe('1')
  })
})
