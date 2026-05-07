import { useQueries, useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { BuilderHomeComposer } from './BuilderHomeComposer'
import { BuilderHomeHeader } from './BuilderHomeHeader'
import { BuilderResumeCard } from './BuilderResumeCard'
import { BuilderShortcutsCard } from './BuilderShortcutsCard'
import { BuilderTokenStrip } from './BuilderTokenStrip'
import {
  BuilderWorkingOnCard,
  type OtherProjectPill,
} from './BuilderWorkingOnCard'
import { NeedsAttentionCard } from './NeedsAttentionCard'
import { userCanSeeMeTokenUsage } from './UserMenu'
import {
  getMeTokenUsage,
  getProject,
  getSoftwareGitHistory,
  listProjects,
  listSoftware,
  listWorkOrders,
  type MeResponse,
} from '../../services/api'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'
import { HOME_STUDIO_ID_LS_KEY } from '../../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../../lib/hostedEnvironment'
import { withUtcMonthQuery } from '../../lib/utcMonthBounds'
import { useStudioAccess } from '../../hooks/useStudioAccess'
import { APP_VERSION } from '../../version'

const LS_SOFTWARE = 'atelier:home:softwareId'
const LS_PROJECT = 'atelier:home:projectId'

export type BuilderHomeDashboardProps = {
  profile: MeResponse
  onLogout: () => void
}

export function BuilderHomeDashboard({
  profile,
  onLogout,
}: BuilderHomeDashboardProps): ReactElement {
  const navigate = useNavigate()
  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)
  const [studioId, setStudioId] = useState<string | null>(null)
  const [softwareId, setSoftwareId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile.studios.length) {
      setStudioId(null)
      return
    }
    setStudioId((current) => {
      if (current && profile.studios.some((s) => s.studio_id === current)) {
        return current
      }
      const saved = localStorage.getItem(HOME_STUDIO_ID_LS_KEY)
      if (saved && profile.studios.some((s) => s.studio_id === saved)) {
        return saved
      }
      return profile.studios[0].studio_id
    })
  }, [profile.studios])

  const handleStudioChange = useCallback((sid: string) => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, sid)
    setStudioId(sid)
    setSoftwareId(null)
    setProjectId(null)
  }, [])

  const { data: softwareList = [] } = useQuery({
    queryKey: ['studios', studioId, 'software'],
    queryFn: () => listSoftware(studioId!),
    enabled: Boolean(studioId),
  })

  useEffect(() => {
    if (!softwareList.length) {
      setSoftwareId(null)
      return
    }
    setSoftwareId((current) => {
      if (current && softwareList.some((s) => s.id === current)) {
        return current
      }
      const saved = localStorage.getItem(LS_SOFTWARE)
      if (saved && softwareList.some((s) => s.id === saved)) {
        return saved
      }
      return softwareList[0].id
    })
  }, [softwareList])

  const { data: projects = [] } = useQuery({
    queryKey: ['software', softwareId, 'projects'],
    queryFn: () => listProjects(softwareId!),
    enabled: Boolean(softwareId),
  })

  useEffect(() => {
    if (!projects.length) {
      setProjectId(null)
      return
    }
    setProjectId((current) => {
      if (current && projects.some((p) => p.id === current)) {
        return current
      }
      const saved = localStorage.getItem(LS_PROJECT)
      if (saved && projects.some((p) => p.id === saved)) {
        return saved
      }
      return projects[0].id
    })
  }, [projects])

  const handleProjectChange = useCallback((pid: string) => {
    localStorage.setItem(LS_PROJECT, pid)
    setProjectId(pid)
  }, [])

  useEffect(() => {
    if (softwareId) localStorage.setItem(LS_SOFTWARE, softwareId)
  }, [softwareId])

  const { data: projectDetail, isPending: projectDetailPending } = useQuery({
    queryKey: ['software', softwareId, 'projects', projectId],
    queryFn: () => getProject(softwareId!, projectId!),
    enabled: Boolean(softwareId && projectId),
  })

  const {
    data: workOrders,
    isPending: workOrdersLoading,
    isError: workOrdersError,
  } = useQuery({
    queryKey: ['projects', projectId, 'work-orders', 'list'],
    queryFn: () => listWorkOrders(projectId!),
    enabled: Boolean(projectId),
    staleTime: 30_000,
    retry: false,
  })

  const {
    data: gitData,
    isPending: gitHistoryLoading,
    isError: gitHistoryError,
  } = useQuery({
    queryKey: ['studios', studioId, 'software', softwareId, 'git-history'],
    queryFn: () => getSoftwareGitHistory(studioId!, softwareId!),
    enabled: Boolean(studioId && softwareId),
    staleTime: 60_000,
    retry: false,
  })

  const otherProjectIds = useMemo(() => {
    if (!projectId) return []
    return projects.filter((p) => p.id !== projectId).map((p) => p.id)
  }, [projects, projectId])

  const otherWorkOrderQueries = useQueries({
    queries: otherProjectIds.map((pid) => ({
      queryKey: ['projects', pid, 'work-orders', 'list'],
      queryFn: () => listWorkOrders(pid),
      enabled: Boolean(pid),
      staleTime: 30_000,
      retry: false,
    })),
  })

  const otherProjectSummaries: OtherProjectPill[] = useMemo(() => {
    return otherProjectIds.map((id, idx) => {
      const p = projects.find((x) => x.id === id)
      const q = otherWorkOrderQueries[idx]
      const pending = q?.isPending ?? true
      const count =
        pending || q?.isError ? null : (q?.data?.length ?? 0)
      return {
        id,
        name: p?.name ?? id,
        workOrderCount: count,
      }
    })
  }, [otherProjectIds, otherWorkOrderQueries, projects])
  const canToken = userCanSeeMeTokenUsage(profile)
  const { data: tokenReport, isPending: tokenPending } = useQuery({
    queryKey: ['me', 'token-usage', 'home', studioId ?? 'none'],
    queryFn: () =>
      getMeTokenUsage({
        limit: 5000,
        offset: 0,
        ...(studioId ? { budget_studio_id: studioId } : {}),
      }),
    enabled: canToken,
    retry: false,
  })

  const software = useMemo(
    () => softwareList.find((s) => s.id === softwareId) ?? null,
    [softwareList, softwareId],
  )
  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  )

  const firstSectionId =
    projectDetail?.sections && projectDetail.sections.length > 0
      ? projectDetail.sections[0].id
      : null
  const sectionCount = projectDetail?.sections?.length ?? 0

  const workOrderCount =
    workOrdersLoading || workOrdersError
      ? null
      : (workOrders?.length ?? 0)
  const lastPublishRelative = gitHistoryError
    ? null
    : formatRelativeTimeUtc(gitData?.commits?.[0]?.created_at)

  const billedToStudioName =
    profile.studios.find((s) => s.studio_id === studioId)?.studio_name ??
    profile.studios[0]?.studio_name ??
    null

  const access = useStudioAccess(profile, studioId ?? undefined, softwareId ?? undefined)

  const showAnalysisShortcut =
    access.isStudioEditor && !access.isCrossStudioViewer
  const showGenerateShortcut = access.isStudioEditor

  useEffect(() => {
    if (!studioId || !softwareId || !projectId || !access.isMember) {
      return
    }

    function onKeyDown(e: KeyboardEvent): void {
      const el = e.target
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const base = `/studios/${studioId}/software/${softwareId}/projects/${projectId}`
      const k = e.key.toLowerCase()

      if (k === 'a' && showAnalysisShortcut) {
        e.preventDefault()
        void navigate(`${base}/issues`)
        return
      }
      if (k === 'g' && showGenerateShortcut) {
        e.preventDefault()
        void navigate(`${base}/work-orders?generate=1`)
        return
      }
      if (k === 'k') {
        e.preventDefault()
        void navigate(`${base}?tab=graph`)
        return
      }
      if (k === 'p' && e.shiftKey && access.canPublish) {
        e.preventDefault()
        void navigate(`${base}?publish=1`)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    studioId,
    softwareId,
    projectId,
    access.isMember,
    access.canPublish,
    showAnalysisShortcut,
    showGenerateShortcut,
    navigate,
  ])

  if (!profile.studios.length) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
        <div className="mx-auto max-w-[1240px]">
          <BuilderHomeHeader
            profile={profile}
            studioId={null}
            onStudioChange={handleStudioChange}
            onLogout={onLogout}
          />
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
            <h2 className="font-serif text-[22px] text-zinc-200">
              Not in a studio yet
            </h2>
            <p className="mt-2 text-[13px] text-zinc-500">
              Ask a Studio Owner to invite you, or{' '}
              <Link to="/studios" className="text-violet-400 hover:underline">
                browse studios
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={studioId}
          onStudioChange={handleStudioChange}
          onLogout={onLogout}
        />

        {!softwareList.length ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center">
            <h2 className="font-serif text-[22px] text-zinc-200">
              No software in this studio yet
            </h2>
            <p className="mt-2 text-[13px] text-zinc-500">
              <Link
                to={`/studios/${studioId ?? ''}`}
                className="text-violet-400 hover:underline"
              >
                Open studio
              </Link>{' '}
              to create a Software product.
            </p>
          </div>
        ) : (
          <>
            <BuilderHomeComposer
              profile={profile}
              studioId={studioId!}
              softwareId={softwareId!}
              projectId={projectId}
              projectName={project?.name ?? null}
              softwareName={software?.name ?? 'Software'}
              canUseSoftwareChat={access.isStudioEditor}
              canSeeComposerHint={access.isMember}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                {software ? (
                  <BuilderWorkingOnCard
                    studioId={studioId!}
                    software={software}
                    projects={projects}
                    project={project}
                    sectionCount={sectionCount}
                    sectionId={firstSectionId}
                    onSelectProjectId={handleProjectChange}
                    workOrderCount={workOrderCount}
                    workOrdersLoading={workOrdersLoading}
                    lastPublishRelative={lastPublishRelative}
                    gitHistoryLoading={gitHistoryLoading}
                    otherProjects={otherProjectSummaries}
                  />
                ) : null}
                {software && project && studioId ? (
                  <NeedsAttentionCard
                    variant="project"
                    studioId={studioId}
                    softwareId={software.id}
                    projectId={project.id}
                  />
                ) : null}
                {profile.user.is_platform_admin ? (
                  <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <h3 className="text-[13px] font-medium text-zinc-200">
                      Platform administration
                    </h3>
                    <ul className="mt-3 list-inside list-disc text-sm text-zinc-400">
                      <li>
                        <Link
                          to="/admin/console"
                          className="text-violet-400 hover:underline"
                        >
                          Admin console
                        </Link>
                      </li>
                      <li>
                        <Link
                          to="/admin/settings"
                          className="text-violet-400 hover:underline"
                        >
                          LLM &amp; embedding settings
                        </Link>
                      </li>
                      <li>
                        <Link to="/llm-usage" className="text-violet-400 hover:underline">
                          LLM usage (filters)
                        </Link>
                      </li>
                    </ul>
                  </section>
                ) : null}
              </div>
              <div className="space-y-6">
                <BuilderTokenStrip
                  report={tokenReport}
                  isPending={tokenPending}
                  canSeeTokenUsage={canToken}
                  billedToStudioName={billedToStudioName}
                  detailReportHref={
                    studioId
                      ? `/llm-usage${withUtcMonthQuery(`studio_id=${encodeURIComponent(studioId)}`)}`
                      : '/llm-usage'
                  }
                />
                {studioId && softwareId && projectId && access.isMember ? (
                  <>
                    <BuilderResumeCard
                      studioId={studioId}
                      softwareId={softwareId}
                      projectId={projectId}
                      projectName={project?.name ?? null}
                      projectUpdatedAt={projectDetail?.updated_at ?? null}
                      sections={projectDetail?.sections}
                      workOrders={
                        workOrdersError ? undefined : workOrders
                      }
                      isPending={projectDetailPending || workOrdersLoading}
                    />
                    <BuilderShortcutsCard
                      studioId={studioId}
                      softwareId={softwareId}
                      projectId={projectId}
                      showAnalysis={showAnalysisShortcut}
                      canPublish={access.canPublish}
                      showGenerateWo={access.isStudioEditor}
                      showOpenGraph={access.isMember}
                    />
                  </>
                ) : null}
              </div>
            </div>
          </>
        )}

        {(profile.cross_studio_grants ?? []).length > 0 ? (
          <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-medium text-zinc-300">
              Shared with you (other studios)
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(profile.cross_studio_grants ?? []).map((g) => (
                <li key={g.grant_id}>
                  <Link
                    to={`/studios/${g.owner_studio_id}/software/${g.target_software_id}`}
                    className="text-violet-400 hover:underline"
                  >
                    {g.software_name}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">
                    ({g.owner_studio_name}) · {g.access_level}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

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
