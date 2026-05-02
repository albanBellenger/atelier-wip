import { useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'

import type { Project, Software } from '../../services/api'

export type OtherProjectPill = {
  id: string
  name: string
  workOrderCount: number | null
}

export type BuilderWorkingOnCardProps = {
  studioId: string
  software: Software
  projects: Project[]
  project: Project | null
  sectionCount: number
  sectionId: string | null
  onSelectProjectId: (projectId: string) => void
  workOrderCount: number | null
  workOrdersLoading: boolean
  lastPublishRelative: string | null
  gitHistoryLoading: boolean
  otherProjects: OtherProjectPill[]
}

export function BuilderWorkingOnCard({
  studioId,
  software,
  projects,
  project,
  sectionCount,
  sectionId,
  onSelectProjectId,
  workOrderCount,
  workOrdersLoading,
  lastPublishRelative,
  gitHistoryLoading,
  otherProjects,
}: BuilderWorkingOnCardProps): ReactElement {
  const [projectOpen, setProjectOpen] = useState(false)
  const nSections = sectionCount
  const softwareLandingPath = `/studios/${studioId}/software/${software.id}`
  const continuePath =
    project && sectionId
      ? `/studios/${studioId}/software/${software.id}/projects/${project.id}/sections/${sectionId}`
      : project
        ? `/studios/${studioId}/software/${software.id}/projects/${project.id}`
        : softwareLandingPath
  const chatPath = project
    ? `/studios/${studioId}/software/${software.id}/projects/${project.id}`
    : `/studios/${studioId}/software/${software.id}`

  const repoLabel =
    software.git_repo_url?.split('/').filter(Boolean).slice(-2).join('/') ?? '—'

  const woDisplay =
    workOrdersLoading || workOrderCount === null ? '—' : String(workOrderCount)
  const lastDisplay =
    gitHistoryLoading
      ? '—'
      : lastPublishRelative && lastPublishRelative.length > 0
        ? lastPublishRelative
        : '—'

  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent"
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            Currently building
          </div>
          <h2 className="mt-2 font-serif text-[26px] font-medium tracking-[-0.015em]">
            <Link
              to={softwareLandingPath}
              className="block truncate text-zinc-100 hover:text-violet-300 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              {software.name}
            </Link>
          </h2>
          {project ? (
            <div className="relative mt-2">
              <button
                type="button"
                id="home-project-combo"
                aria-haspopup="listbox"
                aria-expanded={projectOpen}
                aria-controls="home-project-listbox"
                onClick={() => setProjectOpen((o) => !o)}
                onBlur={() => setTimeout(() => setProjectOpen(false), 120)}
                className="group flex max-w-full items-baseline gap-1.5 rounded-md border border-transparent px-1 py-0.5 text-left text-[15px] font-medium text-zinc-100 hover:border-zinc-800 hover:bg-zinc-900/60"
              >
                <span className="shrink-0 text-zinc-600">Project ·</span>
                <span className="min-w-0 truncate">{project.name}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="shrink-0 translate-y-px text-zinc-500 group-hover:text-zinc-300"
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
                <ul
                  id="home-project-listbox"
                  role="listbox"
                  aria-labelledby="home-project-combo"
                  className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-56 min-w-[min(100%,280px)] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-2xl shadow-black/40"
                >
                  {projects.map((p) => (
                    <li key={p.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={p.id === project.id}
                        onMouseDown={() => {
                          onSelectProjectId(p.id)
                          setProjectOpen(false)
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                          p.id === project.id ? 'text-zinc-100' : 'text-zinc-300'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.id === project.id ? (
                          <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No project in this software yet.</p>
          )}
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-zinc-500">
            {software.definition ?? software.description ?? '—'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            to={chatPath}
            className="rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-800"
          >
            Open chat
          </Link>
          <Link
            to={continuePath}
            className="rounded-md bg-violet-600 px-3.5 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-violet-500"
          >
            Continue editing →
          </Link>
        </div>
      </div>
      {project ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Sections
              </div>
              <div className="mt-1.5 text-[18px] text-zinc-100">{nSections}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">markdown files</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Work orders
              </div>
              <div className="mt-1.5 text-[18px] text-zinc-100">{woDisplay}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                active across phases
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Repository
              </div>
              <div className="mt-1.5 truncate font-mono text-[14px] text-zinc-100">
                {repoLabel}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                branch {software.git_branch ?? 'main'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                Last publish
              </div>
              <div className="mt-1.5 text-[18px] text-zinc-100">{lastDisplay}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                committed to GitLab
              </div>
            </div>
          </div>
          {otherProjects.length > 0 ? (
            <>
              <div className="my-6 h-px w-full bg-zinc-800/80" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-full text-[11px] uppercase tracking-[0.14em] text-zinc-500 sm:w-auto">
                  Other projects in this software
                </span>
                {otherProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectProjectId(p.id)}
                    className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[12px] text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                  >
                    {p.name}{' '}
                    <span className="ml-1 text-zinc-600">
                      {p.workOrderCount === null ? '—' : p.workOrderCount}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
