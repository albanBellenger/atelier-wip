import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { BuilderTokenStrip } from '../components/home/BuilderTokenStrip'
import { userCanSeeMeTokenUsage } from '../components/home/UserMenu'
import { SettingsGearIcon } from '../components/icons/SettingsGearIcon'
import { StudioArtifactsSection } from '../components/studio/StudioArtifactsSection'
import { StudioProjectsSection } from '../components/studio/StudioProjectsSection'
import { StudioSoftwareSection } from '../components/studio/StudioSoftwareSection'
import { SoftwareBuildingTeamCard } from '../components/software/SoftwareBuildingTeamCard'
import { SoftwareRecentActivityCard } from '../components/software/SoftwareRecentActivityCard'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { withUtcMonthQuery } from '../lib/utcMonthBounds'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import {
  createSoftware,
  downloadArtifactBlobById,
  getMeTokenUsage,
  getStudio,
  getStudioActivity,
  listMembers,
  listSoftware,
  listStudioArtifacts,
  listStudioProjects,
  logout as logoutApi,
  me,
} from '../services/api'

export function StudioPage(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sid = studioId ?? ''
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

  const access = useStudioAccess(profile, sid)

  const studioQ = useQuery({
    queryKey: ['studio', sid],
    queryFn: () => getStudio(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const membersQ = useQuery({
    queryKey: ['members', sid],
    queryFn: () => listMembers(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const softwareQ = useQuery({
    queryKey: ['software', sid],
    queryFn: () => listSoftware(sid),
    enabled: Boolean(sid && access.isMember),
  })

  const studioProjectsQ = useQuery({
    queryKey: ['studio', sid, 'projects'],
    queryFn: () => listStudioProjects(sid, { includeArchived: true }),
    enabled: Boolean(sid && access.isMember),
    retry: false,
  })

  const activityFeedEnabled = Boolean(
    sid && access.isMember && access.canCreateProject,
  )

  const canListStudioTeam = Boolean(
    sid && (access.role != null || access.isPlatformAdmin),
  )

  const activityQ = useQuery({
    queryKey: ['studio', sid, 'activity'],
    queryFn: () => getStudioActivity(sid, { limit: 20 }),
    enabled: Boolean(sid && access.isMember && activityFeedEnabled),
    retry: false,
  })

  const tokenReportQ = useQuery({
    queryKey: ['me', 'token-usage', 'studio', sid],
    queryFn: () =>
      getMeTokenUsage({
        studio_id: sid,
        limit: 5000,
        offset: 0,
      }),
    enabled: Boolean(
      sid && access.isMember && profile && userCanSeeMeTokenUsage(profile),
    ),
    retry: false,
  })

  const billedToStudioName =
    profile?.studios.find((s) => s.studio_id === sid)?.studio_name ??
    profile?.studios[0]?.studio_name ??
    null

  const artifactsQ = useQuery({
    queryKey: ['studio', sid, 'artifacts'],
    queryFn: () => listStudioArtifacts(sid),
    enabled: Boolean(sid && access.isMember),
    retry: false,
  })

  const studioDefaultUploadTarget = useMemo((): {
    projectId: string
    softwareId: string
  } | null => {
    const rows = studioProjectsQ.data ?? []
    const active = rows.filter((p) => !p.archived)
    const pick = active[0] ?? rows[0]
    if (!pick) return null
    return { projectId: pick.id, softwareId: pick.software_id }
  }, [studioProjectsQ.data])

  const [newSoftwareName, setNewSoftwareName] = useState('')

  const createSwMut = useMutation({
    mutationFn: () => createSoftware(sid, { name: newSoftwareName.trim() }),
    onSuccess: (newSw) => {
      setNewSoftwareName('')
      void qc.invalidateQueries({ queryKey: ['software', sid] })
      void qc.invalidateQueries({ queryKey: ['studio', sid, 'projects'] })
      void navigate(`/studios/${sid}/software/${newSw.id}`)
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

  if (!sid) {
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
        <p>You don&apos;t have access to this studio.</p>
        <Link to="/studios" className="mt-4 inline-block text-violet-400">
          Back to studios
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
        />

        {studioQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {studioQ.isError && (
          <p className="text-red-400">Could not load studio.</p>
        )}

        {studioQ.data && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-7">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent"
              />
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    Studio
                  </div>
                  <h1 className="mt-2 font-serif text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-zinc-100">
                    {studioQ.data.name}
                  </h1>
                  {studioQ.data.description ? (
                    <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-zinc-400">
                      {studioQ.data.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-row flex-wrap items-center justify-start gap-2 lg:justify-end">
                  {profile && userCanSeeMeTokenUsage(profile) ? (
                    <Link
                      to={`/llm-usage${withUtcMonthQuery(`studio_id=${encodeURIComponent(sid)}`)}`}
                      className="inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
                    >
                      Token usage
                    </Link>
                  ) : null}
                  {access.isStudioAdmin ? (
                    <Link
                      to={`/studios/${sid}/settings`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800"
                    >
                      <SettingsGearIcon />
                      Studio settings
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="flex min-w-0 flex-col gap-10">
                <StudioSoftwareSection
                  studioId={sid}
                  software={softwareQ.data}
                  isPending={softwareQ.isPending}
                  canCreateSoftware={access.isStudioAdmin}
                  newSoftwareName={newSoftwareName}
                  onNewSoftwareNameChange={setNewSoftwareName}
                  onCreateSoftware={() => {
                    if (!newSoftwareName.trim()) return
                    createSwMut.mutate()
                  }}
                  createPending={createSwMut.isPending}
                />
                <StudioProjectsSection
                  studioId={sid}
                  projects={studioProjectsQ.data}
                  isPending={studioProjectsQ.isPending}
                />
                <StudioArtifactsSection
                  studioId={sid}
                  defaultSoftwareId={studioDefaultUploadTarget?.softwareId ?? null}
                  defaultProjectId={studioDefaultUploadTarget?.projectId ?? null}
                  canStudioEditor={access.isStudioEditor}
                  isMember={access.isMember}
                  isPending={artifactsQ.isPending}
                  isError={artifactsQ.isError}
                  rows={artifactsQ.data}
                  onDownload={handleArtifactDownload}
                />
              </div>
              <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
                <SoftwareRecentActivityCard
                  enabled={activityFeedEnabled}
                  isPending={activityQ.isPending}
                  isError={activityQ.isError}
                  items={activityQ.data?.items ?? []}
                  subtitle="Across all software in this studio"
                />
                <SoftwareBuildingTeamCard
                  enabled={canListStudioTeam}
                  isPending={membersQ.isPending}
                  isError={membersQ.isError}
                  members={membersQ.data ?? []}
                  currentUserId={profile.user.id}
                  studioId={sid}
                  showManageLink={access.isStudioAdmin}
                  buildingHeading="Building this studio"
                />
                <div className="mt-6 min-w-0">
                  <BuilderTokenStrip
                    report={tokenReportQ.data}
                    isPending={tokenReportQ.isPending}
                    canSeeTokenUsage={userCanSeeMeTokenUsage(profile)}
                    billedToStudioName={billedToStudioName}
                    heading="Studio LLM usage"
                    detailReportHref={`/llm-usage${withUtcMonthQuery(`studio_id=${encodeURIComponent(sid)}`)}`}
                    sectionPaddingClass="p-5"
                  />
                </div>
              </aside>
            </div>
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
