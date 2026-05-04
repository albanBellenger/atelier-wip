import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { SoftwareChatRoom } from '../components/chat/SoftwareChatRoom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { BuilderTokenStrip } from '../components/home/BuilderTokenStrip'
import { userCanSeeMeTokenUsage } from '../components/home/UserMenu'
import { NeedsAttentionCard } from '../components/home/NeedsAttentionCard'
import { SoftwareArtifactsSection } from '../components/software/SoftwareArtifactsSection'
import { SoftwareBuildingTeamCard } from '../components/software/SoftwareBuildingTeamCard'
import { SoftwareDefinitionPreviewCard } from '../components/software/SoftwareDefinitionPreviewCard'
import { SoftwareRecentActivityCard } from '../components/software/SoftwareRecentActivityCard'
import { SettingsGearIcon } from '../components/icons/SettingsGearIcon'
import { formatRelativeTimeUtc } from '../lib/formatRelativeTime'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { withUtcMonthQuery } from '../lib/utcMonthBounds'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import {
  createProject,
  downloadArtifactBlobById,
  getSoftware,
  getSoftwareActivity,
  getSoftwareAttention,
  getSoftwareGitHistory,
  getMeTokenUsage,
  listMembers,
  listProjects,
  listSoftware,
  listSoftwareArtifacts,
  logout as logoutApi,
  me,
} from '../services/api'

function displayRepoHostPath(url: string | null | undefined): string {
  const u = (url ?? '').trim()
  if (!u) return '—'
  try {
    const parsed = new URL(u)
    const path = parsed.pathname.replace(/\/$/, '')
    return `${parsed.host}${path}` || u
  } catch {
    return u.length > 56 ? `${u.slice(0, 53)}…` : u
  }
}

export function SoftwarePage(): ReactElement {
  const { studioId, softwareId } = useParams<{
    studioId: string
    softwareId: string
  }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

  const {
    data: profile,
    isPending: profilePending,
    isError: profileError,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileError, navigate])

  const access = useStudioAccess(profile, sid, sfid)

  const swQ = useQuery({
    queryKey: ['softwareOne', sid, sfid],
    queryFn: () => getSoftware(sid, sfid),
    enabled: Boolean(sid && sfid && access.isMember),
  })

  const studioSoftwareListQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const headerTrailingCrumb = useMemo(() => {
    if (!swQ.data) return undefined
    const rows = studioSoftwareListQ.data ?? []
    const base = { label: swQ.data.name }
    if (rows.length <= 1) return base
    return {
      ...base,
      softwareSwitcher: {
        currentSoftwareId: sfid,
        softwareOptions: rows.map((r) => ({ id: r.id, name: r.name })),
        onSoftwareSelect: (nextId: string) => {
          void navigate(`/studios/${sid}/software/${nextId}`)
        },
      },
    }
  }, [swQ.data, studioSoftwareListQ.data, sfid, sid, navigate])

  const tabRaw = searchParams.get('tab')
  const softwareView: 'overview' | 'chat' =
    tabRaw === 'chat' ? 'chat' : 'overview'

  const setSoftwareTab = useCallback(
    (next: 'overview' | 'chat') => {
      const nextParams = new URLSearchParams(searchParams)
      if (next === 'overview') {
        nextParams.delete('tab')
      } else {
        nextParams.set('tab', next)
      }
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  useEffect(() => {
    if (profilePending || !profile) {
      return
    }
    if (tabRaw === 'chat' && !access.isStudioEditor) {
      const next = new URLSearchParams(searchParams)
      next.delete('tab')
      setSearchParams(next, { replace: true })
    }
  }, [
    profilePending,
    profile,
    tabRaw,
    access.isStudioEditor,
    searchParams,
    setSearchParams,
  ])

  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [showNewProjectRow, setShowNewProjectRow] = useState(false)

  const projectsAllQ = useQuery({
    queryKey: ['projects', sfid, 'all'],
    queryFn: () => listProjects(sfid, { includeArchived: true }),
    enabled: Boolean(sfid && access.isMember),
  })

  const displayedProjects = useMemo(() => {
    const rows = projectsAllQ.data ?? []
    return showArchivedProjects
      ? rows
      : rows.filter((p) => !p.archived)
  }, [projectsAllQ.data, showArchivedProjects])

  const activeProjectCount = useMemo(
    () => (projectsAllQ.data ?? []).filter((p) => !p.archived).length,
    [projectsAllQ.data],
  )
  const totalProjectCount = (projectsAllQ.data ?? []).length

  const defaultProjectId = useMemo(() => {
    const rows = projectsAllQ.data ?? []
    const active = rows.find((p) => !p.archived)
    return active?.id ?? rows[0]?.id ?? null
  }, [projectsAllQ.data])

  const primaryActiveProjectId = useMemo(() => {
    const rows = projectsAllQ.data ?? []
    return rows.find((p) => !p.archived)?.id ?? null
  }, [projectsAllQ.data])

  const activityFeedEnabled = Boolean(
    sfid && access.isMember && access.canCreateProject,
  )

  const canListStudioTeam = Boolean(
    sid && (access.role != null || access.isToolAdmin),
  )

  const membersQ = useQuery({
    queryKey: ['members', sid],
    queryFn: () => listMembers(sid),
    enabled: Boolean(sid && access.isMember && canListStudioTeam),
    retry: false,
  })

  const attentionQ = useQuery({
    queryKey: ['software', sfid, 'attention'],
    queryFn: () => getSoftwareAttention(sfid),
    enabled: Boolean(
      sfid && access.isMember && !access.isCrossStudioViewer,
    ),
    retry: false,
  })

  const attentionByProjectId = useMemo(() => {
    const items = attentionQ.data?.items ?? []
    const m = new Map<string, number>()
    for (const row of items) {
      const k = row.project_id
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [attentionQ.data])

  const activityQ = useQuery({
    queryKey: ['software', sfid, 'activity'],
    queryFn: () => getSoftwareActivity(sfid, { limit: 20 }),
    enabled: Boolean(sfid && access.isMember && access.canCreateProject),
    retry: false,
  })

  const tokenReportQ = useQuery({
    queryKey: ['me', 'token-usage', 'software', sfid],
    queryFn: () =>
      getMeTokenUsage({
        software_id: sfid,
        limit: 5000,
        offset: 0,
      }),
    enabled: Boolean(
      sfid &&
        access.isMember &&
        profile &&
        userCanSeeMeTokenUsage(profile),
    ),
    retry: false,
  })

  const billedToStudioName =
    profile?.studios.find((s) => s.studio_id === sid)?.studio_name ??
    profile?.studios[0]?.studio_name ??
    null

  const artifactsQ = useQuery({
    queryKey: ['software', sfid, 'artifacts'],
    queryFn: () => listSoftwareArtifacts(sfid),
    enabled: Boolean(sfid && access.isMember),
    retry: false,
  })

  const [projectName, setProjectName] = useState('')
  const createProjectMut = useMutation({
    mutationFn: () =>
      createProject(sfid, {
        name: projectName.trim() || 'Untitled project',
      }),
    onSuccess: () => {
      setProjectName('')
      setShowNewProjectRow(false)
      void qc.invalidateQueries({ queryKey: ['projects', sfid] })
      void qc.invalidateQueries({ queryKey: ['software', sfid, 'activity'] })
      void qc.invalidateQueries({ queryKey: ['software', sfid, 'attention'] })
    },
  })

  const gitHistQ = useQuery({
    queryKey: ['gitHistory', sid, sfid],
    queryFn: () => getSoftwareGitHistory(sid, sfid),
    enabled: Boolean(
      sid &&
        sfid &&
        access.isMember &&
        swQ.data?.git_token_set &&
        Boolean(swQ.data?.git_repo_url?.trim()),
    ),
  })

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  const handleStudioChange = useCallback(
    (nextStudioId: string) => {
      void navigate(`/studios/${nextStudioId}`)
    },
    [navigate],
  )

  const handleArtifactDownload = useCallback(
    async (artifactId: string, filename: string) => {
      try {
        const blob = await downloadArtifactBlobById(artifactId)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || 'download'
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        /* keep minimal */
      }
    },
    [],
  )

  const firstCommit = gitHistQ.data?.commits[0]
  const lastCommitRelative = formatRelativeTimeUtc(firstCommit?.created_at)
  const lastCommitSha =
    firstCommit?.short_id ??
    (firstCommit?.id ? String(firstCommit.id).slice(0, 7) : null)

  if (!sid || !sfid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember && profile) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={sid}
          onStudioChange={handleStudioChange}
          onLogout={() => void handleLogout()}
          trailingCrumb={headerTrailingCrumb}
        />

        {swQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {swQ.isError && (
          <p className="text-red-400">Could not load software.</p>
        )}

        {swQ.data && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent"
              />
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    Software
                  </div>
                  <h1 className="mt-2 font-serif text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-zinc-100">
                    {swQ.data.name}
                  </h1>
                  {swQ.data.description ? (
                    <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
                      {swQ.data.description}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-0.5 font-mono text-[11px] text-zinc-300">
                      {displayRepoHostPath(swQ.data.git_repo_url)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-2.5 py-0.5 text-[11px] text-zinc-300">
                      branch{' '}
                      <span className="font-mono">
                        {swQ.data.git_branch?.trim() || 'main'}
                      </span>
                    </span>
                    {firstCommit && lastCommitSha ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                          aria-hidden
                        />
                        last commit{' '}
                        <span className="font-mono">{lastCommitSha}</span>
                        {lastCommitRelative ? (
                          <>
                            {' '}
                            · {lastCommitRelative}
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-row flex-wrap items-center justify-start gap-2 lg:justify-end">
                  {access.canPublish && defaultProjectId ? (
                    <button
                      type="button"
                      className="rounded-md border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-[12px] font-medium text-zinc-200 hover:bg-zinc-800"
                      onClick={() =>
                        void navigate(
                          `/studios/${sid}/software/${sfid}/projects/${defaultProjectId}?publish=1`,
                        )
                      }
                    >
                      Commit to GitLab
                    </button>
                  ) : null}
                  <Link
                    to={`/llm-usage${withUtcMonthQuery(`software_id=${encodeURIComponent(sfid)}`)}`}
                    className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
                  >
                    Token usage
                  </Link>
                  {access.isStudioAdmin ? (
                    <Link
                      to={`/studios/${sid}/software/${sfid}/settings`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
                    >
                      <SettingsGearIcon />
                      Software settings
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="mt-6 flex flex-wrap gap-2 border-b border-zinc-800/80 pb-3">
              <button
                type="button"
                onClick={() => setSoftwareTab('overview')}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                  softwareView === 'overview'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                Overview
              </button>
              {access.isStudioEditor ? (
                <button
                  type="button"
                  onClick={() => setSoftwareTab('chat')}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                    softwareView === 'chat'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Software chat
                </button>
              ) : null}
            </div>

            {softwareView === 'chat' ? (
              <div className="mt-8">
                <SoftwareChatRoom softwareId={sfid} />
              </div>
            ) : (
              <>
            <SoftwareDefinitionPreviewCard
              className="mt-8"
              definition={swQ.data.definition}
              showEditLink={access.canEditSoftwareDefinition}
              settingsPath={`/studios/${sid}/software/${sfid}/settings`}
            />
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="flex min-w-0 flex-col gap-10">
            <section
              id="software-projects-section"
              className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-zinc-800 px-5 py-4">
                <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                  <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
                    Projects
                  </h2>
                  {projectsAllQ.data != null ? (
                    <span className="text-[13px] text-zinc-500">
                      {activeProjectCount} of {totalProjectCount}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-5">
                  {access.isMember ? (
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span
                        id="software-projects-archived-label"
                        className="shrink-0 text-[12px] text-zinc-500"
                      >
                        Show archived
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showArchivedProjects}
                        aria-labelledby="software-projects-archived-label"
                        onClick={() => setShowArchivedProjects((v) => !v)}
                        className={`relative h-5 w-9 shrink-0 overflow-hidden rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
                          showArchivedProjects
                            ? 'border-violet-500 bg-violet-600'
                            : 'border-zinc-600 bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 shadow transition-transform ${
                            showArchivedProjects
                              ? 'translate-x-[1.125rem]'
                              : 'translate-x-0.5'
                          }`}
                          aria-hidden
                        />
                      </button>
                    </div>
                  ) : null}
                  {access.canCreateProject ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-violet-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/80"
                      onClick={() => setShowNewProjectRow((v) => !v)}
                    >
                      + New project
                    </button>
                  ) : null}
                </div>
              </div>
              {access.isMember && access.canCreateProject && showNewProjectRow ? (
                <div className="flex flex-wrap gap-2 border-b border-zinc-800 bg-zinc-900/40 px-5 py-3">
                  <input
                    className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600"
                    placeholder="Project name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        createProjectMut.mutate()
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={createProjectMut.isPending}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                    onClick={() => createProjectMut.mutate()}
                  >
                    Create
                  </button>
                </div>
              ) : null}
              {projectsAllQ.isPending && (
                <p className="px-5 py-6 text-[13px] text-zinc-500">
                  Loading projects…
                </p>
              )}
              {projectsAllQ.data && displayedProjects.length === 0 && (
                <p className="px-5 py-6 text-[13px] text-zinc-500">
                  No projects yet.
                </p>
              )}
              {projectsAllQ.data && displayedProjects.length > 0 ? (
                <ul className="divide-y divide-zinc-800">
                  {displayedProjects.map((p) => {
                    const attentionN = attentionByProjectId.get(p.id) ?? 0
                    const woDone = p.work_orders_done
                    const woTotal = p.work_orders_total
                    const pct =
                      woTotal > 0
                        ? Math.min(100, Math.round((woDone / woTotal) * 100))
                        : 0
                    const edited =
                      formatRelativeTimeUtc(p.last_edited_at ?? p.updated_at) ??
                      null
                    const isCurrent =
                      !p.archived && p.id === primaryActiveProjectId
                    return (
                      <li key={p.id}>
                        <Link
                          to={`/studios/${sid}/software/${sfid}/projects/${p.id}`}
                          className={`group relative flex gap-0 border-l-[3px] pl-0 transition-colors hover:bg-zinc-800/40 ${
                            isCurrent
                              ? 'border-l-violet-500'
                              : 'border-l-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1 px-5 py-4 pr-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                                  {p.name}
                                </span>
                                {p.archived ? (
                                  <span className="shrink-0 rounded-full border border-zinc-600 bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                                    archived
                                  </span>
                                ) : null}
                                {isCurrent ? (
                                  <span className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                                    current
                                  </span>
                                ) : null}
                              </div>
                              {attentionN > 0 ? (
                                <span className="shrink-0 rounded-full bg-rose-950/80 px-2 py-0.5 text-[11px] font-medium text-rose-100 ring-1 ring-rose-500/30">
                                  {attentionN} attention
                                </span>
                              ) : null}
                            </div>
                            {p.description ? (
                              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
                                {p.description}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-zinc-500">
                              <p>
                                <span className="text-zinc-500">Work orders · </span>
                                <span className="font-medium text-zinc-100">
                                  {woDone}
                                </span>
                                <span className="text-zinc-500">
                                  {' '}
                                  / {woTotal} done
                                </span>
                              </p>
                              <p className="text-zinc-500">
                                {p.sections_count}{' '}
                                {p.sections_count === 1 ? 'section' : 'sections'}
                                {edited ? (
                                  <>
                                    {' '}
                                    · edited {edited}
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <div
                              className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800"
                              aria-hidden
                            >
                              <div
                                className="h-full rounded-full bg-violet-600 transition-all group-hover:bg-violet-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </section>

            {access.isMember && !access.isCrossStudioViewer ? (
              <NeedsAttentionCard
                variant="software"
                studioId={sid}
                softwareId={sfid}
                issuesProjectId={defaultProjectId}
              />
            ) : null}

            <SoftwareArtifactsSection
              studioId={sid}
              softwareId={sfid}
              defaultProjectId={defaultProjectId}
              canStudioEditor={access.isStudioEditor}
              isMember={access.isMember}
              isPending={artifactsQ.isPending}
              isError={artifactsQ.isError}
              rows={artifactsQ.data}
              onDownload={handleArtifactDownload}
            />

            {gitHistQ.data && gitHistQ.data.commits.length > 0 ? (
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-sm font-medium text-zinc-300">
                  Recent commits
                </h2>
                <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                  {gitHistQ.data.commits.slice(0, 20).map((c, i) => (
                    <li key={c.id ?? c.short_id ?? `${i}`}>
                      <span className="text-zinc-300">
                        {c.title ?? c.short_id ?? 'commit'}
                      </span>
                      {c.web_url ? (
                        <a
                          href={c.web_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 text-violet-400 hover:underline"
                        >
                          GitLab
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            </div>
            <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
              <SoftwareRecentActivityCard
                enabled={activityFeedEnabled}
                isPending={activityQ.isPending}
                isError={activityQ.isError}
                items={activityQ.data?.items ?? []}
              />
              <SoftwareBuildingTeamCard
                enabled={canListStudioTeam}
                isPending={membersQ.isPending}
                isError={membersQ.isError}
                members={membersQ.data ?? []}
                currentUserId={profile.user.id}
                studioId={sid}
                showManageLink={access.isStudioAdmin}
              />
              <div className="mt-6 min-w-0">
                <BuilderTokenStrip
                  report={tokenReportQ.data}
                  isPending={tokenReportQ.isPending}
                  canSeeTokenUsage={userCanSeeMeTokenUsage(profile)}
                  billedToStudioName={billedToStudioName}
                  detailReportHref={`/llm-usage${withUtcMonthQuery(`software_id=${encodeURIComponent(sfid)}`)}`}
                  sectionPaddingClass="p-5"
                />
              </div>
            </aside>
          </div>
              </>
            )}
          </>
        )}

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
          <span>Atelier · Builder workspace</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <Link
              to="/changelog"
              className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              v{APP_VERSION}
            </Link>
            <span className="select-none font-sans text-zinc-700" aria-hidden>
              ·
            </span>
            <span
              className="rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500"
              title={`Hosted environment: ${hostedEnvLabel}`}
            >
              {hostedEnvLabel}
            </span>
          </span>
        </footer>
      </div>
    </div>
  )
}
