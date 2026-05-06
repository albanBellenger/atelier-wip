import { useState, type ReactElement } from 'react'

import { Link } from 'react-router-dom'

import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'
import { studioRoleLabel } from '../../lib/roleLabels'
import type { MeResponse } from '../../services/api'

export type BuilderHomeHeaderSoftwareSwitcher = {
  currentSoftwareId: string
  softwareOptions: { id: string; name: string }[]
  onSoftwareSelect: (softwareId: string) => void
}

export type BuilderHomeHeaderProjectSwitcher = {
  currentProjectId: string
  projectOptions: { id: string; name: string }[]
  onProjectSelect: (projectId: string) => void
}

export type BuilderHomeHeaderTrailingCrumb = {
  /** Software segment after studio; omit when the page has no software crumb (e.g. studio-only or project under studio). */
  label?: string
  /** When present and ``softwareOptions`` has 2+ items, the crumb is a switcher (same pattern as studio). */
  softwareSwitcher?: BuilderHomeHeaderSoftwareSwitcher
  /** Optional segment after software: ``Studio / Software / {projectLabel}``. */
  projectLabel?: string
  /** When present and ``projectOptions`` has 2+ items, the project segment is a switcher (same pattern as software). */
  projectSwitcher?: BuilderHomeHeaderProjectSwitcher
}

export type BuilderHomeHeaderProps = {
  profile: MeResponse
  /** When ``onStudioChange`` is omitted, the first studio is shown as a static label (no switcher). */
  studioId?: string | null
  onStudioChange?: (studioId: string) => void
  onLogout: () => void
  /** Optional third segment after studio (e.g. software name on the software page). */
  trailingCrumb?: BuilderHomeHeaderTrailingCrumb
}

export function BuilderHomeHeader({
  profile,
  studioId,
  onStudioChange,
  onLogout,
  trailingCrumb,
}: BuilderHomeHeaderProps): ReactElement {
  const [studioOpen, setStudioOpen] = useState(false)
  const [softwareOpen, setSoftwareOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const showStudioSwitcher = Boolean(onStudioChange)
  const effectiveStudioId =
    studioId ??
    profile.studios[0]?.studio_id ??
    null
  const current = profile.studios.find((s) => s.studio_id === effectiveStudioId)

  const softwareSwitcher = trailingCrumb?.softwareSwitcher
  const showSoftwareSwitcher = Boolean(
    softwareSwitcher &&
      softwareSwitcher.softwareOptions.length > 1,
  )
  const trailingSoftwareLabel = trailingCrumb?.label?.trim() ?? ''
  const showSoftwareCrumbRow = Boolean(
    trailingCrumb &&
      (showSoftwareSwitcher || trailingSoftwareLabel.length > 0),
  )
  const softwareButtonLabel = (() => {
    if (!trailingCrumb) return ''
    if (!softwareSwitcher || !showSoftwareSwitcher) return trailingSoftwareLabel
    return (
      softwareSwitcher.softwareOptions.find(
        (o) => o.id === softwareSwitcher.currentSoftwareId,
      )?.name ?? trailingSoftwareLabel
    )
  })()

  const projectSwitcher = trailingCrumb?.projectSwitcher
  const showProjectSwitcher = Boolean(
    projectSwitcher && projectSwitcher.projectOptions.length > 1,
  )
  const projectButtonLabel = (() => {
    if (!trailingCrumb?.projectLabel?.trim()) return ''
    if (!projectSwitcher || !showProjectSwitcher) {
      return trailingCrumb.projectLabel
    }
    return (
      projectSwitcher.projectOptions.find(
        (o) => o.id === projectSwitcher.currentProjectId,
      )?.name ?? trailingCrumb.projectLabel
    )
  })()

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
          <Link
            to="/"
            className="shrink-0 text-[15px] font-semibold tracking-tight text-zinc-100 hover:text-zinc-50 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            Atelier
          </Link>
          <span className="shrink-0 text-zinc-700">/</span>
          <div className="relative min-w-0">
            {showStudioSwitcher ? (
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
            ) : (
              <span className="block max-w-full truncate px-2 py-1 text-[15px] font-semibold text-zinc-100">
                {current?.studio_name ?? 'No studio'}
              </span>
            )}
            {showStudioSwitcher && studioOpen && profile.studios.length > 0 ? (
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
                          onStudioChange?.(s.studio_id)
                          setStudioOpen(false)
                        }}
                        aria-current={
                          s.studio_id === effectiveStudioId ? 'true' : undefined
                        }
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                          s.studio_id === effectiveStudioId
                            ? 'bg-zinc-900/70 text-zinc-100'
                            : 'text-zinc-300'
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {s.studio_name}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                            {studioRoleLabel(s.role)}
                          </span>
                          {s.studio_id === effectiveStudioId ? (
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
          {trailingCrumb ? (
            <>
              {showSoftwareCrumbRow ? (
                <>
                  <span className="shrink-0 text-zinc-700">/</span>
                  {showSoftwareSwitcher && softwareSwitcher ? (
                    <div className="relative min-w-0">
                      <button
                        type="button"
                        onClick={() => setSoftwareOpen((o) => !o)}
                        onBlur={() =>
                          setTimeout(() => setSoftwareOpen(false), 120)
                        }
                        className="group flex max-w-full items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-[15px] font-semibold text-zinc-100 hover:border-zinc-800 hover:bg-zinc-900/60"
                        title={softwareButtonLabel}
                      >
                        <span className="truncate">{softwareButtonLabel}</span>
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
                      {softwareOpen ? (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-72 w-72 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
                          <div className="border-b border-zinc-800/80 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                            Switch software
                          </div>
                          <ul className="py-1">
                            {softwareSwitcher.softwareOptions.map((sw) => (
                              <li key={sw.id}>
                                <button
                                  type="button"
                                  onMouseDown={() => {
                                    softwareSwitcher.onSoftwareSelect(sw.id)
                                    setSoftwareOpen(false)
                                  }}
                                  aria-current={
                                    sw.id === softwareSwitcher.currentSoftwareId
                                      ? 'true'
                                      : undefined
                                  }
                                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                                    sw.id === softwareSwitcher.currentSoftwareId
                                      ? 'bg-zinc-900/70 text-zinc-100'
                                      : 'text-zinc-300'
                                  }`}
                                >
                                  <span className="min-w-0 truncate">
                                    {sw.name}
                                  </span>
                                  {sw.id === softwareSwitcher.currentSoftwareId ? (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full bg-violet-500"
                                      aria-hidden
                                    />
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span
                      className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-zinc-100"
                      title={trailingSoftwareLabel}
                    >
                      {trailingSoftwareLabel}
                    </span>
                  )}
                </>
              ) : null}
              {trailingCrumb.projectLabel &&
              trailingCrumb.projectLabel.trim().length > 0 ? (
                <>
                  <span className="shrink-0 text-zinc-700">/</span>
                  {showProjectSwitcher && projectSwitcher ? (
                    <div className="relative min-w-0">
                      <button
                        type="button"
                        onClick={() => setProjectOpen((o) => !o)}
                        onBlur={() =>
                          setTimeout(() => setProjectOpen(false), 120)
                        }
                        className="group flex max-w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-[15px] font-semibold text-zinc-200 hover:border-zinc-800 hover:bg-zinc-900/60"
                        title={projectButtonLabel}
                      >
                        <span className="min-w-0 max-w-[min(28rem,45vw)] truncate">
                          {projectButtonLabel}
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
                      {projectOpen ? (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-72 w-72 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
                          <div className="border-b border-zinc-800/80 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                            Switch project
                          </div>
                          <ul className="py-1">
                            {projectSwitcher.projectOptions.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onMouseDown={() => {
                                    projectSwitcher.onProjectSelect(p.id)
                                    setProjectOpen(false)
                                  }}
                                  aria-current={
                                    p.id === projectSwitcher.currentProjectId
                                      ? 'true'
                                      : undefined
                                  }
                                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                                    p.id === projectSwitcher.currentProjectId
                                      ? 'bg-zinc-900/70 text-zinc-100'
                                      : 'text-zinc-300'
                                  }`}
                                >
                                  <span className="min-w-0 truncate">
                                    {p.name}
                                  </span>
                                  {p.id ===
                                  projectSwitcher.currentProjectId ? (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full bg-violet-500"
                                      aria-hidden
                                    />
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span
                      className="min-w-0 max-w-[min(28rem,45vw)] truncate text-[15px] font-semibold tracking-tight text-zinc-200"
                      title={trailingCrumb.projectLabel}
                    >
                      {trailingCrumb.projectLabel}
                    </span>
                  )}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm">
        {profile.user.is_tool_admin ? (
          <Link
            to="/admin/console"
            className="flex h-9 shrink-0 items-center rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 text-[12px] font-semibold tracking-tight text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
            aria-label="Admin console"
          >
            Admin
          </Link>
        ) : null}
        <NotificationBell />
        <div className="h-5 w-px bg-zinc-800" />
        <UserMenu profile={profile} onLogout={onLogout} />
      </div>
    </header>
  )
}
