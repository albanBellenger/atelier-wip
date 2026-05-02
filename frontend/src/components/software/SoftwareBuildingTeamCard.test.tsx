import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { StudioMember } from '../../services/api'
import { SoftwareBuildingTeamCard } from './SoftwareBuildingTeamCard'

function wrap(ui: ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

const joined = '2026-01-01T00:00:00Z'

describe('SoftwareBuildingTeamCard', () => {
  it('lists studio members in role order with per-row badges and header count', () => {
    const members: StudioMember[] = [
      {
        user_id: 'u-admin',
        email: 'owner@x.dev',
        display_name: 'Owner One',
        role: 'studio_admin',
        joined_at: joined,
      },
      {
        user_id: 'u-b1',
        email: 'b1@x.dev',
        display_name: 'Builder Alpha',
        role: 'studio_member',
        joined_at: joined,
      },
      {
        user_id: 'u-b2',
        email: 'b2@x.dev',
        display_name: 'Builder Beta',
        role: 'studio_member',
        joined_at: joined,
      },
      {
        user_id: 'u-v',
        email: 'view@x.dev',
        display_name: 'Viewer Only',
        role: 'studio_viewer',
        joined_at: joined,
      },
    ]

    wrap(
      <SoftwareBuildingTeamCard
        enabled
        isPending={false}
        isError={false}
        members={members}
        currentUserId="u-b1"
        studioId="s1"
        showManageLink
      />,
    )

    expect(
      screen.getByRole('heading', { name: /building this software/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/team members/i)).toHaveTextContent('4')

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Owner')
    expect(rows[0]).toHaveTextContent('Owner One')
    expect(rows[1]).toHaveTextContent('Builder')
    expect(rows[1]).toHaveTextContent('Builder Alpha')
    expect(rows[1]).toHaveTextContent('(you)')
    expect(rows[2]).toHaveTextContent('Builder Beta')
    expect(rows[3]).toHaveTextContent('Viewer')

    expect(screen.getByText('OO')).toBeInTheDocument()
    expect(screen.getByText('BA')).toBeInTheDocument()
    expect(screen.getByText('BB')).toBeInTheDocument()
    expect(screen.getByText('VO')).toBeInTheDocument()

    const manage = screen.getByRole('link', { name: /manage/i })
    expect(manage).toHaveAttribute('href', '/studios/s1/settings')
  })

  it('uses custom buildingHeading for project context', () => {
    wrap(
      <SoftwareBuildingTeamCard
        enabled
        isPending={false}
        isError={false}
        members={[
          {
            user_id: 'u1',
            email: 'a@x.dev',
            display_name: 'Alban',
            role: 'studio_admin',
            joined_at: joined,
          },
        ]}
        currentUserId="u1"
        studioId="s1"
        showManageLink={false}
        buildingHeading="Building this project"
      />,
    )

    expect(
      screen.getByRole('heading', { name: /building this project/i }),
    ).toBeInTheDocument()
  })

  it('shows presence dot when user id is in presenceOnlineUserIds', () => {
    wrap(
      <SoftwareBuildingTeamCard
        enabled
        isPending={false}
        isError={false}
        members={[
          {
            user_id: 'u-online',
            email: 'on@x.dev',
            display_name: 'Online User',
            role: 'studio_member',
            joined_at: joined,
          },
        ]}
        currentUserId="u-other"
        studioId="s1"
        showManageLink={false}
        presenceOnlineUserIds={['u-online']}
      />,
    )

    expect(screen.getByLabelText(/online/i)).toBeInTheDocument()
  })

  it('omits Manage link when showManageLink is false', () => {
    wrap(
      <SoftwareBuildingTeamCard
        enabled
        isPending={false}
        isError={false}
        members={[
          {
            user_id: 'u-v',
            email: 'v@x.dev',
            display_name: 'Vee',
            role: 'studio_viewer',
            joined_at: joined,
          },
        ]}
        currentUserId="u-v"
        studioId="s1"
        showManageLink={false}
      />,
    )

    expect(
      screen.queryByRole('link', { name: /manage/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a message when disabled', () => {
    wrap(
      <SoftwareBuildingTeamCard
        enabled={false}
        isPending={false}
        isError={false}
        members={[]}
        currentUserId="u1"
        studioId="s1"
        showManageLink={false}
      />,
    )

    expect(
      screen.getByText(/team roster is visible to members of this studio/i),
    ).toBeInTheDocument()
  })
})
