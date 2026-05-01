import { useState, type ReactElement } from 'react'

import { Link } from 'react-router-dom'

import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'
import type { MeResponse } from '../../services/api'

export type BuilderHomeHeaderProps = {
  profile: MeResponse
  studioId: string | null
  onStudioChange: (studioId: string) => void
  onLogout: () => void
}

export function BuilderHomeHeader({
  profile,
  studioId,
  onStudioChange,
  onLogout,
}: BuilderHomeHeaderProps): ReactElement {
  const [studioOpen, setStudioOpen] = useState(false)
  const current = profile.studios.find((s) => s.studio_id === studioId)

  return (
    <header className="flex items-center justify-between gap-6 pb-10">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M2 13L8 3L14 13H2Z"
              stroke="#8b5cf6"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              d="M5.5 13L8 8.5L10.5 13"
              stroke="#8b5cf6"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[15px] font-semibold tracking-tight text-zinc-100">
            Atelier
          </span>
          <span className="shrink-0 text-zinc-700">/</span>
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setStudioOpen((o) => !o)}
              onBlur={() => setTimeout(() => setStudioOpen(false), 120)}
              disabled={profile.studios.length === 0}
              className="group flex max-w-full items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-[15px] font-semibold text-zinc-100 hover:border-zinc-800 hover:bg-zinc-900/60 disabled:opacity-50"
            >
              <span className="truncate">
                {current?.studio_name ?? 'No studio'}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className="shrink-0 text-zinc-500 group-hover:text-zinc-300"
                aria-hidden
              >
                <path
                  d="M2 4l3 3 3-3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {studioOpen && profile.studios.length > 0 ? (
              <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-72 w-72 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
                <div className="border-b border-zinc-800/80 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Switch studio
                </div>
                <ul className="py-1">
                  {profile.studios.map((s) => (
                    <li key={s.studio_id}>
                      <button
                        type="button"
                        onMouseDown={() => {
                          onStudioChange(s.studio_id)
                          setStudioOpen(false)
                        }}
                        aria-current={
                          s.studio_id === studioId ? 'true' : undefined
                        }
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                          s.studio_id === studioId
                            ? 'bg-zinc-900/70 text-zinc-100'
                            : 'text-zinc-300'
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {s.studio_name}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                            {s.role.replace('_', ' ')}
                          </span>
                          {s.studio_id === studioId ? (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-violet-500"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-zinc-800/80 px-3 py-2">
                  <Link
                    to="/studios"
                    className="text-[12px] text-zinc-400 hover:text-zinc-200"
                  >
                    Browse all studios →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm">
        <NotificationBell />
        <div className="h-5 w-px bg-zinc-800" />
        <UserMenu profile={profile} onLogout={onLogout} />
      </div>
    </header>
  )
}
