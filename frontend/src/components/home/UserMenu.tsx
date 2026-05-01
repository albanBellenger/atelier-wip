import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { MeResponse } from '../../services/api'

export type UserMenuProps = {
  profile: MeResponse
  onLogout: () => void
}

export function userCanSeeMeTokenUsage(profile: MeResponse): boolean {
  return profile.studios.length > 0 || profile.user.is_tool_admin
}

export function UserMenu({ profile, onLogout }: UserMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const canToken = userCanSeeMeTokenUsage(profile)
  const initials = profile.user.display_name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 140)
        }}
        aria-label={`Open menu for ${profile.user.display_name}`}
        aria-expanded={open}
        className={`flex h-8 w-8 items-center justify-center rounded-full border bg-zinc-900 text-[11px] font-medium text-zinc-200 transition hover:bg-zinc-800 ${
          open ? 'border-violet-500' : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3 border-b border-zinc-800/80 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-[12px] font-medium text-zinc-200">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] text-zinc-100">
                {profile.user.display_name}
              </div>
              <div className="truncate text-[11px] text-zinc-500">
                {profile.user.email}
              </div>
            </div>
          </div>
          <ul className="py-1">
            <li>
              <Link
                to="/me/profile"
                className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px] text-zinc-200 transition hover:bg-zinc-900"
                onMouseDown={() => setOpen(false)}
              >
                <span>Profile</span>
                <span className="text-[11px] text-zinc-600">
                  Account & preferences
                </span>
              </Link>
            </li>
            {canToken ? (
              <li>
                <Link
                  to="/me/token-usage"
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px] text-zinc-200 transition hover:bg-zinc-900"
                  onMouseDown={() => setOpen(false)}
                >
                  <span>Token usage</span>
                  <span className="text-[11px] text-zinc-600">
                    Monthly budget & breakdown
                  </span>
                </Link>
              </li>
            ) : null}
            <li>
              <div className="my-1 h-px bg-zinc-800/80" />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setOpen(false)
                  void onLogout()
                }}
                className="flex w-full items-center px-4 py-2 text-left text-[13px] text-rose-300 transition hover:bg-zinc-900 hover:text-rose-200"
              >
                Logout
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}
