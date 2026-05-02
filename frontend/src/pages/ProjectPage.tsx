import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ChatRoom } from '../components/chat/ChatRoom'
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph'
import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { BuilderTokenStrip } from '../components/home/BuilderTokenStrip'
import { NeedsAttentionCard } from '../components/home/NeedsAttentionCard'
import { userCanSeeMeTokenUsage } from '../components/home/UserMenu'
import { ProjectOutlineCard } from '../components/project/ProjectOutlineCard'
import { ProjectSyncStatusCard } from '../components/project/ProjectSyncStatusCard'
import { ProjectWorkOrderKanbanPreview } from '../components/project/ProjectWorkOrderKanbanPreview'
import { ProjectAggregatedArtifactsSection } from '../components/software/ProjectAggregatedArtifactsSection'
import { SoftwareBuildingTeamCard } from '../components/software/SoftwareBuildingTeamCard'
import { SoftwareRecentActivityCard } from '../components/software/SoftwareRecentActivityCard'
import { SettingsGearIcon } from '../components/icons/SettingsGearIcon'
import { ListSkeleton } from '../components/ui/ListSkeleton'
import { showPublishSuccessToast } from '../components/ui/Toast'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { formatRelativeTimeUtc } from '../lib/formatRelativeTime'
import {
  createSection,
  deleteSection,
  downloadArtifactBlob,
  getProject,
  getProjectAttention,
  getProjectGraph,
  getSoftware,
  getSoftwareGitHistory,
  getMeTokenUsage,
  listMembers,
  listSoftware,
  listSoftwareArtifacts,
  listWorkOrders,
  listProjectIssues,
  logout as logoutApi,
  me,
  publishProject,
  getSoftwareActivity,
  listProjects,
  reorderSections,
} from '../services/api'
import type { SectionSummary } from '../services/api'

function ProjectWorkspaceStatusPill(props: {
  attentionTotal: number
  isPending: boolean
}): ReactElement {
  const { attentionTotal, isPending } = props
  if (isPending) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-900/50 px-2.5 py-1.5 text-[11px] text-zinc-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
        Checking workspace…
      </div>
    )
  }
  const clean = attentionTotal === 0
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] ${
        clean
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          clean ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
        }`}
      />
      {clean
        ? 'Nothing flagged for this project'
        : `${attentionTotal} attention item${attentionTotal === 1 ? '' : 's'}`}
    </div>
  )
}

function StatLabel(props: { children: string }): ReactElement {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
      {props.children}
    </div>
  )
}

function HeroStatCard(props: {
  label: string
  value: string | number
  sub: string
  dotClass: string
}): ReactElement {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/30 px-4 py-3">
      <StatLabel>{props.label}</StatLabel>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${props.dotClass}`}
          aria-hidden
        />
        <span className="font-mono text-[20px] tabular-nums leading-none text-zinc-100">
          {props.value}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">{props.sub}</div>
    </div>
  )
}

export function ProjectPage(): ReactElement {
  const { studioId, softwareId, projectId } = useParams<{
    studioId: string
    softwareId: string
    projectId: string
  }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
  const sfid = softwareId ?? ''
  const pid = projectId ?? ''

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

  const [searchParams, setSearchParams] = useSearchParams()

  const projectQ = useQuery({
    queryKey: ['project', sfid, pid],
    queryFn: () => getProject(sfid, pid),
    enabled: Boolean(sfid && pid && access.isMember),
  })

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

  const softwareProjectsNavQ = useQuery({
    queryKey: ['projects', sfid, 'breadcrumb'],
    queryFn: () => listProjects(sfid),
    enabled: Boolean(sfid && access.isMember),
  })

  const headerTrailingCrumb = useMemo(() => {
    if (!swQ.data || !projectQ.data) return undefined
    const swRows = studioSoftwareListQ.data ?? []
    const projRows = (softwareProjectsNavQ.data ?? []).filter((p) => !p.archived)
    const baseLabel = swQ.data.name
    return {
      label: baseLabel,
      projectLabel: projectQ.data.name,
      softwareSwitcher:
        swRows.length > 1
          ? {
              currentSoftwareId: sfid,
              softwareOptions: swRows.map((r) => ({ id: r.id, name: r.name })),
              onSoftwareSelect: (nextId: string) => {
                void navigate(`/studios/${sid}/software/${nextId}`)
              },
            }
          : undefined,
      projectSwitcher:
        projRows.length > 1
          ? {
              currentProjectId: pid,
              projectOptions: projRows.map((p) => ({ id: p.id, name: p.name })),
              onProjectSelect: (nextId: string) => {
                void navigate(
                  `/studios/${sid}/software/${sfid}/projects/${nextId}`,
                )
              },
            }
          : undefined,
    }
  }, [
    swQ.data,
    projectQ.data,
    studioSoftwareListQ.data,
    softwareProjectsNavQ.data,
    sfid,
    sid,
    pid,
    navigate,
  ])

  const sectionsSorted = useMemo((): SectionSummary[] => {
    const raw = projectQ.data?.sections
    if (!raw?.length) {
      return []
    }
    return [...raw].sort((a, b) => a.order - b.order)
  }, [projectQ.data?.sections])

  const sectionsById = useMemo(() => {
    const m = new Map<string, SectionSummary>()
    for (const s of sectionsSorted) {
      m.set(s.id, s)
    }
    return m
  }, [sectionsSorted])

  const [publishOpen, setPublishOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')

  const tabRaw = searchParams.get('tab')
  const projectView: 'outline' | 'graph' | 'chat' =
    tabRaw === 'graph' || tabRaw === 'chat' ? tabRaw : 'outline'

  const setProjectTab = useCallback(
    (next: 'outline' | 'graph' | 'chat') => {
      const nextParams = new URLSearchParams(searchParams)
      if (next === 'outline') {
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

  useEffect(() => {
    if (profilePending || !profile) {
      return
    }
    if (searchParams.get('publish') === '1') {
      if (access.canPublish) {
        setPublishOpen(true)
      }
      const next = new URLSearchParams(searchParams)
      next.delete('publish')
      setSearchParams(next, { replace: true })
    }
  }, [profilePending, profile, searchParams, access.canPublish, setSearchParams])

  const publishMut = useMutation({
    mutationFn: () =>
      publishProject(pid, {
        commit_message: commitMsg.trim() || null,
      }),
    onSuccess: (data) => {
      setPublishOpen(false)
      setCommitMsg('')
      showPublishSuccessToast(data.files_committed, data.commit_url)
    },
  })

  const graphQ = useQuery({
    queryKey: ['projectGraph', pid],
    queryFn: () => getProjectGraph(pid),
    enabled: Boolean(
      pid && access.isMember && projectView === 'graph' && projectQ.isSuccess,
    ),
  })

  const attentionToolbarQ = useQuery({
    queryKey: ['projects', pid, 'attention', 'toolbar'],
    queryFn: () => getProjectAttention(pid),
    enabled: Boolean(
      pid && access.isMember && !access.isCrossStudioViewer && projectView === 'outline',
    ),
    retry: false,
  })

  const workOrdersQ = useQuery({
    queryKey: ['projects', pid, 'work-orders', 'landing'],
    queryFn: () => listWorkOrders(pid),
    enabled: Boolean(pid && access.isMember && projectView === 'outline'),
    retry: false,
  })

  const projectAggregatedArtifactsQ = useQuery({
    queryKey: ['software', sfid, 'artifacts', 'projectPage', pid],
    queryFn: () => listSoftwareArtifacts(sfid, { forProjectId: pid }),
    enabled: Boolean(
      sfid && pid && access.isMember && projectView === 'outline',
    ),
    retry: false,
  })

  const projectIssuesQ = useQuery({
    queryKey: ['projectIssues', pid],
    queryFn: () => listProjectIssues(pid),
    enabled: Boolean(
      pid &&
        access.isMember &&
        projectView === 'outline' &&
        access.isStudioEditor &&
        !access.isCrossStudioViewer,
    ),
    retry: false,
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

  const activityFeedEnabled = Boolean(
    sfid && access.isMember && access.canCreateProject,
  )

  const activityQ = useQuery({
    queryKey: ['software', sfid, 'activity', 'project', pid],
    queryFn: () => getSoftwareActivity(sfid, { limit: 40 }),
    enabled: Boolean(sfid && access.isMember && activityFeedEnabled),
    retry: false,
  })

  const projectActivityItems = useMemo(() => {
    const rows = activityQ.data?.items ?? []
    return rows.filter(
      (r) => r.entity_type === 'project' && r.entity_id === pid,
    )
  }, [activityQ.data?.items, pid])

  const canListStudioTeam = Boolean(
    sid && (access.role != null || access.isToolAdmin),
  )

  const membersQ = useQuery({
    queryKey: ['members', sid],
    queryFn: () => listMembers(sid),
    enabled: Boolean(sid && access.isMember && canListStudioTeam),
    retry: false,
  })

  const tokenReportQ = useQuery({
    queryKey: ['me', 'token-usage', 'project', pid],
    queryFn: () =>
      getMeTokenUsage({
        project_id: pid,
        limit: 5000,
        offset: 0,
      }),
    enabled: Boolean(
      pid && access.isMember && profile && userCanSeeMeTokenUsage(profile),
    ),
    retry: false,
  })

  const billedToStudioName =
    profile?.studios.find((s) => s.studio_id === sid)?.studio_name ??
    profile?.studios[0]?.studio_name ??
    null

  const [newTitle, setNewTitle] = useState('')

  const createSectionMut = useMutation({
    mutationFn: () =>
      createSection(pid, { title: newTitle.trim() || 'Untitled' }),
    onSuccess: () => {
      setNewTitle('')
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
      void qc.invalidateQueries({ queryKey: ['projectIssues', pid] })
    },
  })

  const deleteSectionMut = useMutation({
    mutationFn: (sectionId: string) => deleteSection(pid, sectionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
      void qc.invalidateQueries({ queryKey: ['projectIssues', pid] })
    },
  })

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderSections(pid, orderedIds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
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
    async (artifactProjectId: string, artifactId: string, filename: string) => {
      try {
        const blob = await downloadArtifactBlob(artifactProjectId, artifactId)
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

  const proj = projectQ.data

  const heroStats = useMemo(() => {
    const secs = sectionsSorted
    const total = secs.length
    const ready = secs.filter((s) => s.status === 'ready').length
    const gaps = secs.filter((s) => s.status === 'gaps').length
    const empty = secs.filter((s) => s.status === 'empty').length
    const conflicts = secs.filter((s) => s.status === 'conflict').length
    const woTotal = proj?.work_orders_total ?? 0
    const woDone = proj?.work_orders_done ?? 0
    const woStale =
      workOrdersQ.data?.filter((w) => w.is_stale && w.status !== 'archived')
        .length ?? 0
    const pct = total > 0 ? Math.round((ready / total) * 100) : 0
    const c = attentionToolbarQ.data?.counts
    const openIssuesFromAttention =
      c != null ? (c.gap ?? 0) + (c.conflict ?? 0) : null
    const openIssues =
      openIssuesFromAttention != null
        ? openIssuesFromAttention
        : gaps + conflicts
    return {
      total,
      ready,
      gaps,
      empty,
      conflicts,
      openIssues,
      woTotal,
      woDone,
      woStale,
      pct,
    }
  }, [sectionsSorted, proj, workOrdersQ.data, attentionToolbarQ.data?.counts])

  const firstCommit = gitHistQ.data?.commits[0]
  const lastCommitSha =
    firstCommit?.short_id ??
    (firstCommit?.id ? String(firstCommit.id).slice(0, 7) : null)
  const lastCommitRelative = formatRelativeTimeUtc(firstCommit?.created_at)

  if (!sid || !sfid || !pid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-[#0a0a0b]" />
  }

  if (profileError || profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] px-4 py-12 text-zinc-100">
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

        <div className="flex flex-col gap-4 pb-7 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {projectView === 'outline' && !access.isCrossStudioViewer ? (
              <ProjectWorkspaceStatusPill
                attentionTotal={attentionToolbarQ.data?.counts.all ?? 0}
                isPending={attentionToolbarQ.isPending}
              />
            ) : (
              <div className="text-[11px] text-zinc-500">
                {projectView === 'graph'
                  ? 'Knowledge graph'
                  : projectView === 'chat'
                    ? 'Project chat'
                    : null}
              </div>
            )}
            {access.canPublish ? (
              <button
                type="button"
                className="rounded-md bg-violet-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:brightness-110"
                onClick={() => setPublishOpen(true)}
              >
                Publish to GitLab →
              </button>
            ) : null}
          </div>
          <nav
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-zinc-400"
            aria-label="Project shortcuts"
          >
            <Link
              to={`/studios/${sid}/software/${sfid}`}
              className="shrink-0 hover:text-zinc-200"
            >
              ← Software
            </Link>
            <Link
              to={`/studios/${sid}/software/${sfid}/projects/${pid}/artifacts`}
              className="shrink-0 hover:text-zinc-200"
            >
              Artifacts
            </Link>
            <Link
              to={`/studios/${sid}/software/${sfid}/projects/${pid}/work-orders`}
              className="shrink-0 hover:text-zinc-200"
            >
              Work orders
            </Link>
            {access.isStudioEditor && !access.isCrossStudioViewer ? (
              <Link
                to={`/studios/${sid}/software/${sfid}/projects/${pid}/issues`}
                className="shrink-0 hover:text-zinc-200"
              >
                Issues
              </Link>
            ) : null}
          </nav>
        </div>

        {projectQ.isPending ? <ListSkeleton rows={4} /> : null}
        {projectQ.isError && (
          <p className="text-red-400">Could not load project.</p>
        )}

        {proj && swQ.data && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent"
              />
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <StatLabel>Project</StatLabel>
                  <h1 className="mt-2 font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.02em] text-zinc-100">
                    {proj.name}
                  </h1>
                  {proj.description ? (
                    <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
                      {proj.description}
                    </p>
                  ) : access.isStudioAdmin ? (
                    <p className="mt-3 max-w-2xl text-[14px] text-zinc-600">
                      Add a description in{' '}
                      <Link
                        to={`/studios/${sid}/software/${sfid}/projects/${pid}/settings`}
                        className="text-violet-400 hover:underline"
                      >
                        project settings
                      </Link>
                      .
                    </p>
                  ) : (
                    <p className="mt-3 max-w-2xl text-[14px] text-zinc-600">
                      No description yet.
                    </p>
                  )}
                </div>
                <div className="flex w-full shrink-0 flex-col gap-6 lg:w-auto lg:items-end">
                  <div className="text-left lg:w-[200px] lg:text-right">
                    <div className="lg:flex lg:flex-col lg:items-end">
                      <StatLabel>Spec progress</StatLabel>
                      <div className="mt-2 text-[34px] font-semibold tabular-nums leading-none tracking-tight text-zinc-100">
                        {heroStats.pct}
                        <span className="text-[18px] font-medium text-zinc-500">
                          %
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-500">
                        {heroStats.ready} of {heroStats.total} sections complete
                      </p>
                      <div className="mt-3 h-1.5 w-full max-w-[11rem] overflow-hidden rounded-full bg-zinc-800/80 lg:ml-auto">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{ width: `${heroStats.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-row flex-wrap items-center justify-start gap-2 lg:justify-end">
                    <Link
                      to={`/me/token-usage?project_id=${encodeURIComponent(pid)}`}
                      className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
                    >
                      Token usage
                    </Link>
                    {access.isStudioAdmin ? (
                      <Link
                        to={`/studios/${sid}/software/${sfid}/projects/${pid}/settings`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
                        aria-label="Open project settings"
                      >
                        <SettingsGearIcon />
                        Project settings
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
                <HeroStatCard
                  label="In progress"
                  value={heroStats.gaps}
                  sub="sections"
                  dotClass="bg-amber-400"
                />
                <HeroStatCard
                  label="Drafts"
                  value={heroStats.empty}
                  sub="not yet promoted"
                  dotClass="bg-violet-400"
                />
                <HeroStatCard
                  label="Open issues"
                  value={heroStats.openIssues}
                  sub="conflicts + gaps"
                  dotClass="bg-rose-400"
                />
                <HeroStatCard
                  label="Work orders"
                  value={
                    heroStats.woTotal > 0
                      ? `${heroStats.woDone}/${heroStats.woTotal}`
                      : '0'
                  }
                  sub="completed"
                  dotClass="bg-emerald-400"
                />
                <HeroStatCard
                  label="Stale flags"
                  value={heroStats.woStale}
                  sub="needs review"
                  dotClass="bg-orange-400"
                />
              </div>
            </section>

            <div className="mt-8 flex flex-wrap gap-2 border-b border-zinc-800/80 pb-3">
              <button
                type="button"
                onClick={() => setProjectTab('outline')}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                  projectView === 'outline'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                Outline
              </button>
              <button
                type="button"
                onClick={() => setProjectTab('graph')}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                  projectView === 'graph'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                Knowledge graph
              </button>
              {access.isStudioEditor ? (
                <button
                  type="button"
                  onClick={() => setProjectTab('chat')}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
                    projectView === 'chat'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Project chat
                </button>
              ) : null}
            </div>

            {projectView === 'outline' ? (
              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <div className="flex min-w-0 flex-col gap-6">
                  <ProjectOutlineCard
                    sections={sectionsSorted}
                    workOrders={workOrdersQ.data ?? []}
                    issues={projectIssuesQ.data ?? []}
                    canManageOutline={access.canManageProjectOutline}
                    onSelectSection={(id) => {
                      void navigate(
                        `/studios/${sid}/software/${sfid}/projects/${pid}/sections/${id}`,
                      )
                    }}
                    onDeleteSection={(id) => deleteSectionMut.mutate(id)}
                    onReorder={(orderedIds) => reorderMut.mutate(orderedIds)}
                    newTitle={newTitle}
                    onNewTitleChange={setNewTitle}
                    onAddSection={() => createSectionMut.mutate()}
                  />

                  {!access.isCrossStudioViewer ? (
                    <NeedsAttentionCard
                      studioId={sid}
                      softwareId={sfid}
                      projectId={pid}
                    />
                  ) : null}

                  <ProjectWorkOrderKanbanPreview
                    studioId={sid}
                    softwareId={sfid}
                    projectId={pid}
                    workOrders={workOrdersQ.data ?? []}
                    sectionsById={sectionsById}
                  />

                  <ProjectAggregatedArtifactsSection
                    studioId={sid}
                    softwareId={sfid}
                    projectId={pid}
                    isMember={access.isMember}
                    canStudioEditor={access.isStudioEditor}
                    isPending={projectAggregatedArtifactsQ.isPending}
                    isError={projectAggregatedArtifactsQ.isError}
                    rows={projectAggregatedArtifactsQ.data}
                    onDownload={handleArtifactDownload}
                  />
                </div>

                <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
                  <ProjectSyncStatusCard
                    sections={sectionsSorted}
                    baselineSha={lastCommitSha}
                    baselineRelative={lastCommitRelative}
                    gitConfigured={Boolean(
                      swQ.data?.git_token_set &&
                        Boolean(swQ.data?.git_repo_url?.trim()),
                    )}
                    canPublish={access.canPublish}
                    onPublishClick={() => setPublishOpen(true)}
                  />

                  <SoftwareRecentActivityCard
                    enabled={activityFeedEnabled}
                    isPending={activityQ.isPending}
                    isError={activityQ.isError}
                    items={projectActivityItems}
                    title="Recent activity"
                    subtitle="Events for this project in this software."
                    emptyMessage="No project-scoped events yet."
                  />

                  <SoftwareBuildingTeamCard
                    enabled={canListStudioTeam}
                    isPending={membersQ.isPending}
                    isError={membersQ.isError}
                    members={membersQ.data ?? []}
                    currentUserId={profile.user.id}
                    studioId={sid}
                    showManageLink={access.isStudioAdmin}
                    buildingHeading="Building this project"
                  />

                  <BuilderTokenStrip
                    report={tokenReportQ.data}
                    isPending={tokenReportQ.isPending}
                    canSeeTokenUsage={userCanSeeMeTokenUsage(profile)}
                    billedToStudioName={billedToStudioName}
                    detailReportHref={`/me/token-usage?project_id=${encodeURIComponent(pid)}`}
                    sectionPaddingClass="p-6"
                  />
                </aside>
              </div>
            ) : projectView === 'graph' ? (
              <div className="mt-8">
                {graphQ.isPending && (
                  <p className="text-zinc-500">Loading graph…</p>
                )}
                {graphQ.isError && (
                  <p className="text-red-400">Could not load knowledge graph.</p>
                )}
                {graphQ.data && (
                  <KnowledgeGraph
                    nodes={graphQ.data.nodes}
                    edges={graphQ.data.edges}
                  />
                )}
              </div>
            ) : (
              <div className="mt-8">
                <ChatRoom projectId={pid} />
              </div>
            )}
          </>
        )}
      </div>
      {publishOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h3 className="text-lg font-medium text-zinc-100">
              Publish to GitLab
            </h3>
            <p className="mt-2 text-xs text-zinc-500">
              Requires git URL + token on the software record.
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              rows={3}
              placeholder="Commit message (optional)"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                onClick={() => setPublishOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={publishMut.isPending}
                aria-label="Confirm publish to GitLab"
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => publishMut.mutate()}
              >
                {publishMut.isPending ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
