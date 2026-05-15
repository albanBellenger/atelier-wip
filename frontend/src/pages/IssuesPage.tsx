import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { IssuesPanel } from '../components/issues/IssuesPanel'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import {
  getProject,
  getSoftware,
  listCodebaseSnapshots,
  listProjectIssues,
  listProjects,
  listSoftware,
  logout as logoutApi,
  me,
  runProjectAnalyze,
  runSoftwareCodeDrift,
  updateIssue,
} from '../services/api'

export function IssuesPage(): ReactElement {
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
  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

  const profileQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileQ.isError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileQ.isError, navigate])

  const access = useStudioAccess(profileQ.data, sid, sfid)

  const swQ = useQuery({
    queryKey: ['softwareOne', sid, sfid],
    queryFn: () => getSoftware(sid, sfid),
    enabled: Boolean(sid && sfid && access.isMember),
  })

  const projectQ = useQuery({
    queryKey: ['project', sfid, pid],
    queryFn: () => getProject(sfid, pid),
    enabled: Boolean(sfid && pid && access.isMember),
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
      softwareId: sfid,
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
                  `/studios/${sid}/software/${sfid}/projects/${nextId}/issues`,
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

  const issuesQ = useQuery({
    queryKey: ['issues', pid],
    queryFn: () => listProjectIssues(pid),
    enabled: Boolean(pid && access.isMember),
  })

  const analyzeMut = useMutation({
    mutationFn: () => runProjectAnalyze(pid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issues', pid] })
    },
  })

  const snapshotsQ = useQuery({
    queryKey: ['codebaseSnapshots', sfid],
    queryFn: () => listCodebaseSnapshots(sfid),
    enabled: Boolean(sfid && access.isMember && access.isStudioEditor),
  })

  const hasReadySnapshot = useMemo(() => {
    const rows = snapshotsQ.data ?? []
    return rows.some((s) => s.status === 'ready')
  }, [snapshotsQ.data])

  const codeDriftDisabledReason = access.isStudioEditor
    ? hasReadySnapshot
      ? null
      : 'Index the codebase first to enable this check'
    : null

  const codeDriftMut = useMutation({
    mutationFn: () => runSoftwareCodeDrift(sfid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issues', pid] })
    },
  })

  const resolveMut = useMutation({
    mutationFn: (args: { issueId: string; resolution_reason?: string }) =>
      updateIssue(pid, args.issueId, 'resolved', {
        resolution_reason: args.resolution_reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issues', pid] })
    },
  })

  if (!sid || !sfid || !pid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (access.isLoadingCapabilities) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading studio access…
      </div>
    )
  }

  if (!access.isMember) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>No access.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  const profile = profileQ.data

  if (access.isCrossStudioViewer) {
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
          <div className="mx-auto max-w-3xl space-y-4 py-8">
            <p>Issues are not visible with read-only cross-studio access.</p>
            <Link
              to={`/studios/${sid}/software/${sfid}/projects/${pid}`}
              className="inline-block text-violet-400 hover:underline"
            >
              Back to project
            </Link>
          </div>
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

        <div className="mx-auto max-w-6xl space-y-6">
          <h1 className="text-2xl font-semibold">Issues</h1>
          {analyzeMut.isSuccess && (
            <p className="text-sm text-emerald-400">
              Created {analyzeMut.data.issues_created} issue(s).
            </p>
          )}
          {codeDriftMut.isSuccess && (
            <p className="text-sm text-emerald-400">
              Code drift run complete
              {codeDriftMut.data.skipped_reason
                ? ` (${codeDriftMut.data.skipped_reason})`
                : `: ${codeDriftMut.data.sections_flagged} section(s), ${codeDriftMut.data.work_orders_flagged} work order(s) flagged`}
              .
            </p>
          )}
          {issuesQ.isPending && (
            <p className="text-zinc-500">Loading issues…</p>
          )}
          {issuesQ.isError && (
            <p className="text-red-400">Could not load issues.</p>
          )}
          <IssuesPanel
            studioId={sid}
            softwareId={sfid}
            projectId={pid}
            issues={issuesQ.data ?? []}
            canRunAnalysis={access.isStudioEditor}
            canRunCodeDrift={access.isStudioEditor}
            canManageIssues={access.isStudioEditor}
            codeDriftDisabledReason={codeDriftDisabledReason}
            analyzePending={analyzeMut.isPending}
            codeDriftPending={codeDriftMut.isPending}
            resolvePending={resolveMut.isPending}
            onRunAnalysis={() => analyzeMut.mutate()}
            onRunCodeDrift={() => codeDriftMut.mutate()}
            onResolve={(issueId, opts) =>
              resolveMut.mutate({ issueId, resolution_reason: opts?.resolution_reason })
            }
          />
        </div>

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
