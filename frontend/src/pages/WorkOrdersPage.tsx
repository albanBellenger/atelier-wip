import {
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { APP_VERSION } from '../version'
import {
  addWorkOrderNote,
  dismissWorkOrderStale,
  generateWorkOrders,
  getProject,
  getSoftware,
  getWorkOrder,
  listMembers,
  listProjects,
  listSections,
  listSoftware,
  listWorkOrders,
  logout as logoutApi,
  me,
  updateWorkOrder,
  type AuthErrorBody,
  type Section,
  type WorkOrder,
  type WorkOrderDetail,
  type WorkOrderListFilters,
} from '../services/api'
import { compareWorkOrdersKanban } from '../lib/workOrderKanbanSort'
import { ListSkeleton } from '../components/ui/ListSkeleton'

function formatApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as AuthErrorBody).detail
    if (typeof d === 'string') {
      return d
    }
    try {
      return JSON.stringify(d)
    } catch {
      return 'Request failed.'
    }
  }
  return 'Request failed.'
}

function apiErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as AuthErrorBody).code
    return typeof c === 'string' ? c : undefined
  }
  return undefined
}

const STATUSES = [
  'backlog',
  'in_progress',
  'in_review',
  'done',
  'archived',
] as const

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  archived: 'Archived',
}

function DraggableCard(props: {
  wo: WorkOrder
  onOpen: () => void
}): ReactElement {
  const { wo, onOpen } = props
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: wo.id })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-zinc-700 bg-zinc-900/80 p-2 text-left text-sm shadow-sm ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={onOpen}
      >
        <span className="line-clamp-2 font-medium text-zinc-100">
          {wo.title}
        </span>
        {wo.phase && (
          <span className="mt-1 block text-xs text-zinc-500">{wo.phase}</span>
        )}
        {wo.assignee_display_name && (
          <span className="mt-1 block text-xs text-violet-300">
            {wo.assignee_display_name}
          </span>
        )}
        {wo.is_stale && (
          <span className="mt-1 inline-block rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
            Stale
          </span>
        )}
      </button>
      <button
        type="button"
        className="mt-2 w-full cursor-grab rounded border border-zinc-600 py-1 text-xs text-zinc-500 active:cursor-grabbing"
        {...listeners}
        {...attributes}
        aria-label="Drag to change status"
      >
        ⋮⋮ Drag
      </button>
    </div>
  )
}

function ReadOnlyWoCard(props: {
  wo: WorkOrder
  onOpen: () => void
  deemphasized?: boolean
}): ReactElement {
  const { wo, onOpen, deemphasized = false } = props
  return (
    <div
      className={`rounded-lg border border-zinc-700 bg-zinc-900/80 p-2 text-left text-sm shadow-sm ${
        deemphasized ? 'opacity-40' : ''
      }`}
    >
      <button type="button" className="w-full text-left" onClick={() => onOpen()}>
        <span
          className={`line-clamp-2 font-medium text-zinc-100 ${
            deemphasized ? 'line-through' : ''
          }`}
        >
          {wo.title}
        </span>
        {wo.phase && (
          <span className="mt-1 block text-xs text-zinc-500">{wo.phase}</span>
        )}
        {wo.assignee_display_name && (
          <span className="mt-1 block text-xs text-violet-300">
            {wo.assignee_display_name}
          </span>
        )}
        {wo.is_stale && (
          <span className="mt-1 inline-block rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
            Stale
          </span>
        )}
      </button>
    </div>
  )
}

function StatusColumn(props: {
  status: string
  title: string
  children: React.ReactNode
}): ReactElement {
  const { status, title, children } = props
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] flex-1 flex-col rounded-xl border bg-zinc-900/40 p-2 ${
        isOver ? 'border-violet-500 ring-1 ring-violet-500/40' : 'border-zinc-800'
      }`}
    >
      <h3 className="mb-2 shrink-0 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function StaticStatusColumn(props: {
  title: string
  children: React.ReactNode
}): ReactElement {
  const { title, children } = props
  return (
    <div className="flex min-h-[200px] flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-2">
      <h3 className="mb-2 shrink-0 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

export function WorkOrdersPage(): ReactElement {
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

  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [filters, setFilters] = useState<WorkOrderListFilters>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [genOpen, setGenOpen] = useState(false)
  const [genSelected, setGenSelected] = useState<Set<string>>(new Set())
  const [activeDrag, setActiveDrag] = useState<WorkOrder | null>(null)

  const [searchParams, setSearchParams] = useSearchParams()

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
      afterProjectLabel: 'Work orders',
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
                  `/studios/${sid}/software/${sfid}/projects/${nextId}/work-orders`,
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

  useEffect(() => {
    if (!profileQ.isSuccess) {
      return
    }
    if (searchParams.get('generate') === '1') {
      if (access.isStudioEditor) {
        setGenOpen(true)
      }
      const next = new URLSearchParams(searchParams)
      next.delete('generate')
      setSearchParams(next, { replace: true })
    }
  }, [profileQ.isSuccess, searchParams, access.isStudioEditor, setSearchParams])

  const ordersQ = useQuery({
    queryKey: ['workOrders', pid, filters],
    queryFn: () => listWorkOrders(pid, filters),
    enabled: Boolean(pid && access.isMember),
  })

  const sectionsQ = useQuery({
    queryKey: ['sections', pid],
    queryFn: () => listSections(pid),
    enabled: Boolean(pid && access.isMember && genOpen),
  })

  const sectionsFilterQ = useQuery({
    queryKey: ['sections', pid, 'all'],
    queryFn: () => listSections(pid),
    enabled: Boolean(pid && access.isMember),
  })

  const membersQ = useQuery({
    queryKey: ['members', sid],
    queryFn: () => listMembers(sid),
    enabled: Boolean(sid && access.isMember && !access.crossGrant),
  })

  const detailQ = useQuery({
    queryKey: ['workOrder', pid, selectedId],
    queryFn: () => getWorkOrder(pid, selectedId!),
    enabled: Boolean(pid && selectedId && access.isMember),
  })

  const updateMut = useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof updateWorkOrder>[2] }) =>
      updateWorkOrder(pid, args.id, args.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workOrders', pid] })
      void qc.invalidateQueries({ queryKey: ['workOrder', pid, selectedId] })
    },
  })

  const genMut = useMutation({
    mutationFn: (sectionIds: string[]) =>
      generateWorkOrders(pid, { section_ids: sectionIds }),
    onSuccess: () => {
      setGenOpen(false)
      setGenSelected(new Set())
      void qc.invalidateQueries({ queryKey: ['workOrders', pid] })
    },
  })

  const noteMut = useMutation({
    mutationFn: (args: { content: string }) =>
      addWorkOrderNote(pid, selectedId!, args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workOrder', pid, selectedId] })
    },
  })

  const dismissMut = useMutation({
    mutationFn: () => dismissWorkOrderStale(pid, selectedId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workOrders', pid] })
      void qc.invalidateQueries({ queryKey: ['workOrder', pid, selectedId] })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const orders = ordersQ.data ?? []

  const byStatus = useMemo(() => {
    const m: Record<string, WorkOrder[]> = {}
    for (const s of STATUSES) {
      m[s] = []
    }
    for (const w of orders) {
      const bucket = m[w.status]
      if (bucket) {
        bucket.push(w)
      } else {
        m.backlog.push(w)
      }
    }
    for (const s of STATUSES) {
      m[s].sort(compareWorkOrdersKanban)
    }
    return m
  }, [orders])

  function onDragStart(e: DragStartEvent): void {
    const id = String(e.active.id)
    const w = orders.find((o) => o.id === id) ?? null
    setActiveDrag(w)
  }

  function onDragEnd(e: DragEndEvent): void {
    setActiveDrag(null)
    const { active, over } = e
    if (!over) {
      return
    }
    const wid = String(active.id)
    const overId = String(over.id)
    let targetStatus: string | undefined
    if ((STATUSES as readonly string[]).includes(overId)) {
      targetStatus = overId
    } else {
      const t = orders.find((o) => o.id === overId)
      if (t) {
        targetStatus = t.status
      }
    }
    if (!targetStatus) {
      return
    }
    const w = orders.find((o) => o.id === wid)
    if (!w || w.status === targetStatus) {
      return
    }
    if (w.status === 'archived' || targetStatus === 'archived') {
      return
    }
    updateMut.mutate({ id: wid, body: { status: targetStatus } })
  }

  const [noteDraft, setNoteDraft] = useState('')

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

  const detail: WorkOrderDetail | undefined = detailQ.data

  const detailPanel = (
    <aside className="w-full shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 lg:w-80">
      {!selectedId && (
        <p className="text-sm text-zinc-500">Select a work order.</p>
      )}
      {selectedId && detailQ.isPending && (
        <p className="text-sm text-zinc-500">Loading…</p>
      )}
      {selectedId && detail && (
        <DetailForm
          key={detail.id}
          detail={detail}
          sections={sectionsFilterQ.data ?? []}
          onClose={() => setSelectedId(null)}
          updateMut={updateMut}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          noteMut={noteMut}
          dismissMut={dismissMut}
          members={membersQ.data ?? []}
          readOnly={!access.isStudioEditor}
        />
      )}
    </aside>
  )

  const profile = profileQ.data

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

        <div className="mb-6 flex flex-wrap items-end gap-4">
          <h1 className="text-2xl font-semibold">Work orders</h1>
          <div className="flex gap-2 rounded-lg border border-zinc-800 p-1">
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm ${
                view === 'kanban'
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              onClick={() => setView('kanban')}
            >
              Kanban
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm ${
                view === 'list'
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              onClick={() => setView('list')}
            >
              List
            </button>
          </div>
          {access.isStudioEditor ? (
            <button
              type="button"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
              onClick={() => {
                genMut.reset()
                setGenOpen(true)
              }}
            >
              Generate…
            </button>
          ) : null}
        </div>

        <div className="mb-6 flex flex-wrap gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Status</span>
            <select
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              value={filters.status ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: e.target.value || undefined,
                }))
              }
            >
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Assignee</span>
            <select
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              value={filters.assignee_id ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  assignee_id: e.target.value || undefined,
                }))
              }
            >
              <option value="">Any</option>
              {(membersQ.data ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Phase (exact)</span>
            <input
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              value={filters.phase ?? ''}
              placeholder="optional"
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  phase: e.target.value.trim() || undefined,
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 pt-5">
            <input
              type="checkbox"
              checked={filters.is_stale === true}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  is_stale: e.target.checked ? true : undefined,
                }))
              }
            />
            <span className="text-zinc-400">Stale only</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Linked section</span>
            <select
              className="max-w-[220px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
              value={filters.section_id ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  section_id: e.target.value || undefined,
                }))
              }
            >
              <option value="">Any</option>
              {(sectionsFilterQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {ordersQ.isPending ? <ListSkeleton rows={5} /> : null}
        {ordersQ.isError && (
          <p className="text-red-400">Could not load work orders.</p>
        )}

        {view === 'kanban' && !ordersQ.isPending && (
          access.isStudioEditor ? (
            <DndContext
              sensors={sensors}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 flex-wrap gap-2 lg:flex-nowrap">
                  {STATUSES.map((st) =>
                    st === 'archived' ? (
                      <StaticStatusColumn
                        key={st}
                        title={STATUS_LABEL[st] ?? st}
                      >
                        {(byStatus[st] ?? []).map((wo) => (
                          <ReadOnlyWoCard
                            key={wo.id}
                            wo={wo}
                            deemphasized
                            onOpen={() => setSelectedId(wo.id)}
                          />
                        ))}
                      </StaticStatusColumn>
                    ) : (
                      <StatusColumn
                        key={st}
                        status={st}
                        title={STATUS_LABEL[st] ?? st}
                      >
                        {(byStatus[st] ?? []).map((wo) => (
                          <DraggableCard
                            key={wo.id}
                            wo={wo}
                            onOpen={() => setSelectedId(wo.id)}
                          />
                        ))}
                      </StatusColumn>
                    ),
                  )}
                </div>
                {detailPanel}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDrag ? (
                  <div className="max-w-[200px] rounded-lg border border-violet-500 bg-zinc-900 p-2 text-sm shadow-xl">
                    {activeDrag.title}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="flex min-w-0 flex-1 flex-wrap gap-2 lg:flex-nowrap">
                {STATUSES.map((st) =>
                  st === 'archived' ? (
                    <StaticStatusColumn
                      key={st}
                      title={STATUS_LABEL[st] ?? st}
                    >
                      {(byStatus[st] ?? []).map((wo) => (
                        <ReadOnlyWoCard
                          key={wo.id}
                          wo={wo}
                          deemphasized
                          onOpen={() => setSelectedId(wo.id)}
                        />
                      ))}
                    </StaticStatusColumn>
                  ) : (
                    <StatusColumn
                      key={st}
                      status={st}
                      title={STATUS_LABEL[st] ?? st}
                    >
                      {(byStatus[st] ?? []).map((wo) => (
                        <ReadOnlyWoCard
                          key={wo.id}
                          wo={wo}
                          onOpen={() => setSelectedId(wo.id)}
                        />
                      ))}
                    </StatusColumn>
                  ),
                )}
              </div>
              {detailPanel}
            </div>
          )
        )}

        {view === 'list' && !ordersQ.isPending && (
          <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="p-3">Title</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Phase</th>
                    <th className="p-3">Assignee</th>
                    <th className="p-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((wo) => (
                    <tr
                      key={wo.id}
                      className={`cursor-pointer border-b border-zinc-800/80 hover:bg-zinc-900/50 ${
                        wo.status === 'archived' ? 'opacity-40' : ''
                      }`}
                      onClick={() => setSelectedId(wo.id)}
                    >
                      <td className="p-3 font-medium text-zinc-100">
                        {wo.status === 'archived' ? (
                          <span className="line-through">{wo.title}</span>
                        ) : (
                          wo.title
                        )}
                        {wo.is_stale && (
                          <span className="ml-2 text-xs text-amber-400">
                            (stale)
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-400">
                        {STATUS_LABEL[wo.status] ?? wo.status}
                      </td>
                      <td className="p-3 text-zinc-500">{wo.phase ?? '—'}</td>
                      <td className="p-3 text-zinc-400">
                        {wo.assignee_display_name ?? '—'}
                      </td>
                      <td className="p-3 text-xs text-zinc-500">
                        {new Date(wo.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length === 0 && (
                <p className="p-6 text-center text-zinc-500">
                  No work orders match filters.
                </p>
              )}
            </div>
            {detailPanel}
          </div>
        )}

        {genOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
              <h2 className="text-lg font-semibold">Generate work orders</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Select one or more sections. The model will propose work orders
                linked to those sections.
              </p>
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {(sectionsQ.data ?? []).map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={genSelected.has(s.id)}
                        onChange={() => {
                          setGenSelected((prev) => {
                            const n = new Set(prev)
                            if (n.has(s.id)) {
                              n.delete(s.id)
                            } else {
                              n.add(s.id)
                            }
                            return n
                          })
                        }}
                      />
                      <span>{s.title}</span>
                      <span className="font-mono text-xs text-zinc-500">
                        {s.slug}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {sectionsQ.isPending && (
                <p className="text-sm text-zinc-500">Loading sections…</p>
              )}
              {genMut.isError && (
                <div
                  className="mt-3 rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm"
                  role="alert"
                >
                  <p className="font-medium text-red-200">Generation failed</p>
                  <p className="mt-1 text-red-100/90">{formatApiError(genMut.error)}</p>
                  {apiErrorCode(genMut.error) === 'LLM_NOT_CONFIGURED' ||
                  apiErrorCode(genMut.error) === 'LLM_PROVIDER_UNSUPPORTED' ? (
                    <p className="mt-2 text-xs text-zinc-400">
                      Configure the LLM (provider, model, API key) in{' '}
                      <Link
                        to="/admin/settings"
                        className="text-violet-400 underline"
                      >
                        Admin settings
                      </Link>
                      . For generation, use{' '}
                      <span className="font-mono">openai</span> or leave provider
                      empty.
                    </p>
                  ) : null}
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-600 px-4 py-2 text-sm"
                  onClick={() => {
                    setGenOpen(false)
                    setGenSelected(new Set())
                    genMut.reset()
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    genSelected.size === 0 || genMut.isPending
                  }
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    genMut.mutate([...genSelected])
                  }
                >
                  {genMut.isPending ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
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

function DetailForm(props: {
  detail: WorkOrderDetail
  sections: Section[]
  onClose: () => void
  updateMut: {
    mutate: (args: {
      id: string
      body: Parameters<typeof updateWorkOrder>[2]
    }) => void
    isPending: boolean
  }
  noteDraft: string
  setNoteDraft: (s: string) => void
  noteMut: { mutate: (args: { content: string }) => void; isPending: boolean }
  dismissMut: { mutate: () => void; isPending: boolean }
  members: { user_id: string; display_name: string }[]
  readOnly?: boolean
}): ReactElement {
  const {
    detail,
    sections,
    onClose,
    updateMut,
    noteDraft,
    setNoteDraft,
    noteMut,
    dismissMut,
    members,
    readOnly = false,
  } = props

  const [title, setTitle] = useState(detail.title)
  const [description, setDescription] = useState(detail.description)
  const [status, setStatus] = useState(detail.status)
  const [phase, setPhase] = useState(detail.phase ?? '')
  const [phaseOrder, setPhaseOrder] = useState(
    detail.phase_order != null ? String(detail.phase_order) : '',
  )
  const [assigneeId, setAssigneeId] = useState(detail.assignee_id ?? '')
  const [impl, setImpl] = useState(detail.implementation_guide ?? '')
  const [accept, setAccept] = useState(detail.acceptance_criteria ?? '')

  const sectionTitles = useMemo(() => {
    const map = new Map(sections.map((s) => [s.id, s.title]))
    return detail.section_ids.map((id) => map.get(id) ?? id)
  }, [sections, detail.section_ids])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-medium text-zinc-100">Detail</h2>
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-300"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {detail.is_stale && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-sm">
          <p className="text-amber-200">Stale</p>
          {detail.stale_reason && (
            <p className="mt-1 text-xs text-amber-100/80">{detail.stale_reason}</p>
          )}
          <button
            type="button"
            className="mt-2 rounded bg-amber-800/50 px-3 py-1 text-xs text-amber-100"
            disabled={dismissMut.isPending || readOnly}
            onClick={() => dismissMut.mutate()}
          >
            Dismiss stale
          </button>
        </div>
      )}
      <label className="block text-xs text-zinc-500">Title</label>
      <input
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        value={title}
        disabled={readOnly}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="block text-xs text-zinc-500">Description</label>
      <textarea
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        rows={4}
        value={description}
        disabled={readOnly}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className="block text-xs text-zinc-500">Phase</label>
      <input
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        value={phase}
        disabled={readOnly}
        onChange={(e) => setPhase(e.target.value)}
      />
      <label className="block text-xs text-zinc-500">Phase order</label>
      <input
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        inputMode="numeric"
        placeholder="optional integer"
        value={phaseOrder}
        disabled={readOnly}
        onChange={(e) => setPhaseOrder(e.target.value)}
      />
      <label className="block text-xs text-zinc-500">Status</label>
      <select
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        value={status}
        disabled={readOnly}
        onChange={(e) => setStatus(e.target.value)}
        aria-label="Work order status"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <label className="block text-xs text-zinc-500">Assignee</label>
      <select
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        value={assigneeId}
        disabled={readOnly}
        onChange={(e) => setAssigneeId(e.target.value)}
      >
        <option value="">—</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.display_name}
          </option>
        ))}
      </select>
      <label className="block text-xs text-zinc-500">Implementation guide</label>
      <textarea
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        rows={3}
        value={impl}
        disabled={readOnly}
        onChange={(e) => setImpl(e.target.value)}
      />
      <label className="block text-xs text-zinc-500">Acceptance criteria</label>
      <textarea
        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
        rows={3}
        value={accept}
        disabled={readOnly}
        onChange={(e) => setAccept(e.target.value)}
      />
      {!readOnly ? (
      <button
        type="button"
        className="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        disabled={updateMut.isPending}
        onClick={() =>
          updateMut.mutate({
            id: detail.id,
            body: {
              title: title.trim(),
              description: description.trim(),
              status: status.trim(),
              phase: phase.trim() || null,
              phase_order: (() => {
                const t = phaseOrder.trim()
                if (t === '') {
                  return null
                }
                const n = Number.parseInt(t, 10)
                return Number.isFinite(n) ? n : null
              })(),
              assignee_id: assigneeId || null,
              implementation_guide: impl.trim() || null,
              acceptance_criteria: accept.trim() || null,
            },
          })
        }
      >
        Save changes
      </button>
      ) : null}
      {detail.section_ids.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500">Linked sections</p>
          <ul className="mt-1 list-inside list-disc text-sm text-zinc-300">
            {sectionTitles.map((t, i) => (
              <li key={detail.section_ids[i]}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-xs font-medium text-zinc-500">Notes</p>
        <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
          {detail.notes.map((n) => (
            <li
              key={n.id}
              className="rounded border border-zinc-800 bg-zinc-950/50 p-2"
            >
              <span className="text-xs text-zinc-500">
                {new Date(n.created_at).toLocaleString()}
              </span>
              <p className="whitespace-pre-wrap text-zinc-300">{n.content}</p>
            </li>
          ))}
        </ul>
        {!readOnly ? (
        <textarea
          className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
          rows={2}
          placeholder="Add a note…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
        />
        ) : null}
        {!readOnly ? (
        <button
          type="button"
          className="mt-2 rounded bg-zinc-700 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={!noteDraft.trim() || noteMut.isPending}
          onClick={() => {
            noteMut.mutate({ content: noteDraft.trim() })
            setNoteDraft('')
          }}
        >
          Add note
        </button>
        ) : null}
      </div>
    </div>
  )
}
