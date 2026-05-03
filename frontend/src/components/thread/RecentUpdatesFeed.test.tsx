import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RecentUpdatesFeed, type RecentUpdateItem } from './RecentUpdatesFeed'

describe('RecentUpdatesFeed', () => {
  it('renders empty state', () => {
    render(<RecentUpdatesFeed items={[]} onDriftClick={() => {}} />)
    expect(screen.getByTestId('recent-updates-feed')).toHaveTextContent(
      'No recent updates yet',
    )
  })

  it('renders LLM patch line', () => {
    const items: RecentUpdateItem[] = [
      {
        id: '1',
        kind: 'llm_patch',
        ts: new Date().toISOString(),
        summary: 'LLM appended 18 lines',
      },
    ]
    render(<RecentUpdatesFeed items={items} onDriftClick={() => {}} />)
    expect(screen.getByText(/LLM appended 18 lines/)).toBeInTheDocument()
  })

  it('renders peer edit line', () => {
    const items: RecentUpdateItem[] = [
      {
        id: 'p1',
        kind: 'peer_edit',
        ts: new Date().toISOString(),
        summary: 'Alice edited the section',
      },
    ]
    render(<RecentUpdatesFeed items={items} onDriftClick={() => {}} />)
    expect(screen.getByText(/Alice edited the section/)).toBeInTheDocument()
  })

  it('renders drift and calls onDriftClick', async () => {
    const user = userEvent.setup()
    const onDrift = vi.fn()
    const items: RecentUpdateItem[] = [
      {
        id: 'd1',
        kind: 'drift',
        ts: new Date().toISOString(),
        workOrderTitle: 'WO-204',
        workOrderId: 'w1',
        reason: 'Section changed',
      },
    ]
    render(
      <RecentUpdatesFeed items={items} driftInteractive onDriftClick={onDrift} />,
    )
    await user.click(
      screen.getByRole('button', { name: /Drift on WO-204/ }),
    )
    expect(onDrift).toHaveBeenCalledTimes(1)
  })

  it('viewer mode: drift row is not a button', () => {
    const items: RecentUpdateItem[] = [
      {
        id: 'd1',
        kind: 'drift',
        ts: new Date().toISOString(),
        workOrderTitle: 'WO-1',
        workOrderId: 'w1',
        reason: 'Stale',
      },
    ]
    render(
      <RecentUpdatesFeed
        items={items}
        driftInteractive={false}
        onDriftClick={() => {}}
      />,
    )
    expect(screen.getByTestId('drift-row-static')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Drift on WO-1/ }),
    ).toBeNull()
  })
})
