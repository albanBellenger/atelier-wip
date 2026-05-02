import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { StudioMember } from '../../services/api'

export type SoftwareBuildingTeamCardProps = {
  enabled: boolean
  isPending: boolean
  isError: boolean
  members: StudioMember[]
  currentUserId: string
  studioId: string
  showManageLink: boolean
  /** Defaults to "Building this software" (software landing). Use "Building this project" on project page. */
  buildingHeading?: string
  /** Link target for "Manage →" (default: studio settings). */
  manageHref?: string
  /** When set, members whose `user_id` is listed show a small online indicator on the avatar. */
  presenceOnlineUserIds?: readonly string[]
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    const w = parts[0]
    return w.slice(0, 2).toUpperCase()
  }
  const a = parts[0][0] ?? ''
  const b = parts[parts.length - 1][0] ?? ''
  return `${a}${b}`.toUpperCase()
}

function roleBadgeForMember(m: StudioMember): { label: string; badgeClass: string } {
  switch (m.role) {
    case 'studio_admin':
      return {
        label: 'Owner',
        badgeClass:
          'border border-violet-500/45 bg-violet-950/70 text-violet-200',
      }
    case 'studio_member':
      return {
        label: 'Builder',
        badgeClass: 'border border-zinc-600 bg-zinc-800/80 text-zinc-300',
      }
    case 'studio_viewer':
      return {
        label: 'Viewer',
        badgeClass: 'border border-sky-500/40 bg-sky-950/55 text-sky-200',
      }
    default:
      return {
        label: m.role,
        badgeClass: 'border border-zinc-600 bg-zinc-800/80 text-zinc-400',
      }
  }
}

function sortMembersFlat(members: StudioMember[]): StudioMember[] {
  const rank = (role: string): number => {
    if (role === 'studio_admin') return 0
    if (role === 'studio_member') return 1
    if (role === 'studio_viewer') return 2
    return 3
  }
  return members.slice().sort((a, b) => {
    const dr = rank(a.role) - rank(b.role)
    if (dr !== 0) return dr
    return a.display_name.localeCompare(b.display_name, undefined, {
      sensitivity: 'base',
    })
  })
}

export function SoftwareBuildingTeamCard({
  enabled,
  isPending,
  isError,
  members,
  currentUserId,
  studioId,
  showManageLink,
  buildingHeading = 'Building this software',
  manageHref,
  presenceOnlineUserIds,
}: SoftwareBuildingTeamCardProps): ReactElement {
  const heading = buildingHeading
  const manageTo = manageHref ?? `/studios/${studioId}/settings`
  const count = members.length
  const rows = sortMembersFlat(members)
  const presence = presenceOnlineUserIds
    ? new Set(presenceOnlineUserIds)
    : null

  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/90 pb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
            {heading}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          {enabled && !isPending ? (
            <span
              className="text-[13px] tabular-nums text-zinc-500"
              aria-label="Team members"
            >
              {count}
            </span>
          ) : null}
          {enabled && showManageLink ? (
            <Link
              to={manageTo}
              className="text-[12px] font-medium text-zinc-400 hover:text-zinc-200"
            >
              Manage →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {!enabled ? (
          <p className="text-[13px] text-zinc-500">
            Team roster is visible to members of this studio.
          </p>
        ) : isPending ? (
          <p className="text-[13px] text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="text-[13px] text-zinc-500">Could not load team.</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No studio members yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((m) => {
              const initials = initialsFromDisplayName(m.display_name)
              const isYou = m.user_id === currentUserId
              const { label, badgeClass } = roleBadgeForMember(m)
              const showPresence = presence?.has(m.user_id) ?? false
              return (
                <li
                  key={m.user_id}
                  className="flex items-center gap-3"
                >
                  <div className="relative shrink-0">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[11px] font-semibold text-zinc-200"
                      aria-hidden
                    >
                      {initials}
                    </span>
                    {showPresence ? (
                      <span
                        className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-zinc-900 bg-emerald-400"
                        aria-label="Online"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-100">
                      {m.display_name}
                      {isYou ? (
                        <span className="font-normal text-zinc-500">
                          {' '}
                          (you)
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[12px] text-zinc-500">
                      {m.email}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                  >
                    {label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
