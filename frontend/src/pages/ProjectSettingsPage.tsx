import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { ArtifactExclusionPanel } from '../components/software/ArtifactExclusionPanel'
import { SettingsGearIcon } from '../components/icons/SettingsGearIcon'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  getProject,
  getSoftware,
  listProjects,
  listSoftware,
  listSoftwareArtifacts,
  logout as logoutApi,
  me,
  patchProjectArtifactExclusion,
  updateProject,
} from '../services/api'

export function ProjectSettingsPage(): ReactElement {
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

  const artifactsQ = useQuery({
    queryKey: ['software', sfid, 'artifacts', 'projectSettings', pid],
    queryFn: () => listSoftwareArtifacts(sfid, { forProjectId: pid }),
    enabled: Boolean(sfid && pid && access.isMember),
  })

  const [savingArtifactId, setSavingArtifactId] = useState<string | null>(null)
  const patchProjectExclusionMut = useMutation({
    mutationFn: ({
      artifactId,
      excluded,
    }: {
      artifactId: string
      excluded: boolean
    }) =>
      patchProjectArtifactExclusion(sid, sfid, pid, {
        artifact_id: artifactId,
        excluded,
      }),
    onMutate: ({ artifactId }) => {
      setSavingArtifactId(artifactId)
    },
    onSettled: () => {
      setSavingArtifactId(null)
      void qc.invalidateQueries({ queryKey: ['software', sfid, 'artifacts'] })
    },
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
                void navigate(
                  `/studios/${sid}/software/${nextId}/projects/${pid}/settings`,
                )
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
                  `/studios/${sid}/software/${sfid}/projects/${nextId}/settings`,
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

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [publishFolderSlug, setPublishFolderSlug] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [formSyncKey, setFormSyncKey] = useState('')
  const proj = projectQ.data
  const serverSyncKey = proj
    ? `${proj.id}:${proj.updated_at ?? ''}:${proj.name}:${proj.description ?? ''}:${proj.publish_folder_slug ?? ''}`
    : ''
  if (proj && serverSyncKey !== formSyncKey) {
    setFormSyncKey(serverSyncKey)
    setName(proj.name)
    setDescription(proj.description ?? '')
    setPublishFolderSlug(proj.publish_folder_slug ?? '')
    setMsg(null)
  }

  const saveMut = useMutation({
    mutationFn: () =>
      updateProject(sfid, pid, {
        name: name.trim(),
        description: description.trim() || null,
        publish_folder_slug: publishFolderSlug.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
      void qc.invalidateQueries({ queryKey: ['projects', sfid] })
      setMsg('Saved.')
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

  if (!sid || !sfid || !pid) {
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

        <div className="mb-8 flex flex-wrap items-center gap-4 text-sm">
          <Link
            to={`/studios/${sid}/software/${sfid}/projects/${pid}`}
            className="inline-flex items-center gap-2 text-violet-400 hover:underline"
          >
            <span aria-hidden>←</span>
            {proj?.name ?? 'Project'}
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="inline-flex items-center gap-2 text-zinc-300">
            <SettingsGearIcon />
            Project settings
          </span>
        </div>

        {projectQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {projectQ.isError && (
          <p className="text-red-400">Could not load project.</p>
        )}

        {proj && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Project settings
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Name, publish folder, and description for{' '}
              <span className="text-zinc-300">{proj.name}</span>.
            </p>

            {msg ? <p className="mt-4 text-sm text-emerald-400">{msg}</p> : null}

            <div className="mt-8 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300">Details</h2>
              {access.isStudioAdmin ? (
                <>
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setMsg(null)
                    }}
                    aria-label="Project name"
                  />
                  <textarea
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    rows={3}
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value)
                      setMsg(null)
                    }}
                  />
                  <label className="block text-xs font-medium text-zinc-500">
                    Publish folder slug (GitLab export root)
                  </label>
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
                    value={publishFolderSlug}
                    onChange={(e) => {
                      setPublishFolderSlug(e.target.value)
                      setMsg(null)
                    }}
                    aria-label="Publish folder slug for Git export"
                  />
                  <p className="text-xs text-zinc-500">
                    Letters, numbers, underscores, and hyphens only. Changing this
                    renames the folder in the connected GitLab repo when Git is
                    configured on the software.
                  </p>
                  <button
                    type="button"
                    disabled={
                      !name.trim() ||
                      !publishFolderSlug.trim() ||
                      saveMut.isPending
                    }
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                    onClick={() => saveMut.mutate()}
                  >
                    Save project
                  </button>
                </>
              ) : (
                <>
                  <p className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-100">
                    {name}
                  </p>
                  <p className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm whitespace-pre-wrap text-zinc-300">
                    {description || '—'}
                  </p>
                  <p className="text-xs font-medium text-zinc-500">
                    Publish folder slug (GitLab export root)
                  </p>
                  <p className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 font-mono text-sm text-zinc-100">
                    {publishFolderSlug || '—'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Only Studio Owners can edit project details.
                  </p>
                </>
              )}
            </div>

            <ArtifactExclusionPanel
              title="Artifact visibility (this project)"
              description="Exclude inherited or sibling-project artifacts from this project’s context. Your own project files can also be excluded from project-scoped use."
              rows={artifactsQ.data ?? []}
              isPending={artifactsQ.isPending}
              isError={artifactsQ.isError}
              mode="project"
              canEdit={access.isStudioEditor && !access.isCrossStudioViewer}
              isSavingId={savingArtifactId}
              onToggleExcluded={(artifactId, nextExcluded) => {
                patchProjectExclusionMut.mutate({
                  artifactId,
                  excluded: nextExcluded,
                })
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
