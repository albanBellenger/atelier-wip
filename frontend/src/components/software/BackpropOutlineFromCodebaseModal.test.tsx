import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../services/api'
import { BackpropOutlineFromCodebaseModal } from './BackpropOutlineFromCodebaseModal'

function wrap(ui: ReactElement): ReactElement {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('BackpropOutlineFromCodebaseModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      wrap(
        <BackpropOutlineFromCodebaseModal
          softwareId="sw"
          isOpen={false}
          onClose={() => undefined}
          onSectionsCreated={() => undefined}
        />,
      ),
    )
    expect(container.firstChild).toBeNull()
  })

  it('accepts selected sections in ascending index order', async () => {
    const user = userEvent.setup()
    const createSpy = vi.spyOn(api, 'createSoftwareDocsSection').mockImplementation(async () => ({
      id: 'new-1',
      project_id: null,
      software_id: 'sw',
      title: 'A',
      slug: 'a',
      order: 0,
      content: '',
      status: 'draft',
      open_issue_count: 0,
      outline_health: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    vi.spyOn(api, 'proposeSoftwareDocsOutline').mockResolvedValue({
      sections: [
        { title: 'First', slug: 'first', summary: 'S1' },
        { title: 'Second', slug: 'second', summary: 'S2' },
      ],
    })
    render(
      wrap(
        <BackpropOutlineFromCodebaseModal
          softwareId="sw"
          isOpen
          onClose={() => undefined}
          onSectionsCreated={() => undefined}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { name: /propose outline/i }))
    await screen.findByText('First')
    const boxes = screen.getAllByRole('checkbox')
    await user.click(boxes[1]!)
    await user.click(boxes[0]!)
    await user.click(screen.getByRole('button', { name: /accept selected/i }))
    expect(createSpy).toHaveBeenCalledTimes(2)
    expect(createSpy.mock.calls[0]?.[1]).toEqual({
      title: 'First',
      slug: 'first',
      content: 'S1',
    })
    expect(createSpy.mock.calls[1]?.[1]).toEqual({
      title: 'Second',
      slug: 'second',
      content: 'S2',
    })
  })
})
