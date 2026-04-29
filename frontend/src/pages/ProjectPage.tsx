import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { OutlineNav } from '../components/outline/OutlineNav'
import { useStudioAccess } from '../hooks/useStudioAccess'
import {
  createSection,
  deleteSection,
  getProject,
  getSection,
  me,
  updateProject,
  updateSection,
} from '../services/api'
import type { SectionSummary } from '../services/api'

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

  const access = useStudioAccess(profile, sid)

  const projectQ = useQuery({
    queryKey: ['project', sfid, pid],
    queryFn: () => getProject(sfid, pid),
    enabled: Boolean(sfid && pid && access.isMember),
  })

  const sectionsSorted = useMemo((): SectionSummary[] => {
    const raw = projectQ.data?.sections
    if (!raw?.length) {
      return []
    }
    return [...raw].sort((a, b) => a.order - b.order)
  }, [projectQ.data?.sections])

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  )
  useEffect(() => {
    if (!sectionsSorted.length) {
      setSelectedSectionId(null)
      return
    }
    setSelectedSectionId((cur) => {
      if (cur && sectionsSorted.some((s) => s.id === cur)) {
        return cur
      }
      return sectionsSorted[0].id
    })
  }, [sectionsSorted])

  const sectionDetailQ = useQuery({
    queryKey: ['section', pid, selectedSectionId],
    queryFn: () => getSection(pid, selectedSectionId!),
    enabled: Boolean(pid && selectedSectionId && access.isMember),
  })

  const [newTitle, setNewTitle] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectFormSyncKey, setProjectFormSyncKey] = useState('')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const createSectionMut = useMutation({
    mutationFn: () =>
      createSection(pid, { title: newTitle.trim() || 'Untitled' }),
    onSuccess: () => {
      setNewTitle('')
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
  })

  const deleteSectionMut = useMutation({
    mutationFn: (sectionId: string) => deleteSection(pid, sectionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
  })

  const reorderMut = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          updateSection(pid, id, { order: index }),
        ),
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
    },
  })

  const updateProjectMut = useMutation({
    mutationFn: () =>
      updateProject(sfid, pid, {
        name: projectName.trim(),
        description: projectDescription.trim() || null,
      }),
    onSuccess: () => {
      setSaveMsg('Saved.')
      void qc.invalidateQueries({ queryKey: ['project', sfid, pid] })
      void qc.invalidateQueries({ queryKey: ['projects', sfid] })
    },
  })

  const proj = projectQ.data
  const projectServerKey = proj
    ? `${proj.id}:${proj.updated_at ?? ''}:${proj.name}:${proj.description ?? ''}`
    : ''
  if (proj && projectServerKey !== projectFormSyncKey) {
    setProjectFormSyncKey(projectServerKey)
    setProjectName(proj.name)
    setProjectDescription(proj.description ?? '')
    setSaveMsg(null)
  }

  if (!sid || !sfid || !pid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileError || profilePending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
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

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-4 text-sm">
          <Link
            to={`/studios/${sid}/software/${sfid}`}
            className="text-violet-400 hover:underline"
          >
            ← Software
          </Link>
          <Link to={`/studios/${sid}`} className="text-zinc-500 hover:text-zinc-300">
            Studio
          </Link>
        </div>

        {projectQ.isPending && <p className="text-zinc-500">Loading…</p>}
        {projectQ.isError && (
          <p className="text-red-400">Could not load project.</p>
        )}

        {proj && (
          <>
            {access.isStudioAdmin ? (
              <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-sm font-medium text-zinc-300">Project</h2>
                {saveMsg && (
                  <p className="text-sm text-emerald-400">{saveMsg}</p>
                )}
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-lg font-semibold text-zinc-100"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value)
                    setSaveMsg(null)
                  }}
                  aria-label="Project name"
                />
                <textarea
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  rows={3}
                  placeholder="Description (optional)"
                  value={projectDescription}
                  onChange={(e) => {
                    setProjectDescription(e.target.value)
                    setSaveMsg(null)
                  }}
                />
                <button
                  type="button"
                  disabled={
                    !projectName.trim() || updateProjectMut.isPending
                  }
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  onClick={() => updateProjectMut.mutate()}
                >
                  Save project
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold">{proj.name}</h1>
                {proj.description && (
                  <p className="mt-2 text-sm text-zinc-400">
                    {proj.description}
                  </p>
                )}
              </>
            )}

            <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]">
              <aside className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <OutlineNav
                  sections={sectionsSorted}
                  selectedSectionId={selectedSectionId}
                  isStudioAdmin={access.isStudioAdmin}
                  onSelect={(id) => setSelectedSectionId(id)}
                  onDelete={(id) => deleteSectionMut.mutate(id)}
                  onReorder={(orderedIds) => reorderMut.mutate(orderedIds)}
                  newTitle={newTitle}
                  onNewTitleChange={setNewTitle}
                  onAddSection={() => createSectionMut.mutate()}
                />
              </aside>

              <main className="min-h-[320px] rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
                {!selectedSectionId && (
                  <p className="text-zinc-500">Select a section.</p>
                )}
                {selectedSectionId && sectionDetailQ.isPending && (
                  <p className="text-zinc-500">Loading section…</p>
                )}
                {selectedSectionId && sectionDetailQ.data && (
                  <div>
                    <h2 className="text-lg font-medium">
                      {sectionDetailQ.data.title}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-zinc-500">
                      {sectionDetailQ.data.slug}
                    </p>
                    <div className="mt-6 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 font-mono text-sm text-zinc-300">
                      {sectionDetailQ.data.content || (
                        <span className="text-zinc-600">Empty content.</span>
                      )}
                    </div>
                  </div>
                )}
              </main>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
