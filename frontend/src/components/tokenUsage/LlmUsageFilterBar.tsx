import type { ReactElement } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { KNOWN_LLM_CALL_TYPES, llmCallTypeLabel } from '../../lib/llmCallTypeLabels'
import type { MeResponse } from '../../services/api'

export type LlmUsageFilters = {
  studioIds: string[]
  softwareIds: string[]
  projectIds: string[]
  workOrderIds: string[]
  userIds: string[]
  callTypes: string[]
  dateFrom: string
  dateTo: string
  limit: number
  offset: number
}

export type FilterPopoverKey =
  | 'studio'
  | 'software'
  | 'project'
  | 'workOrder'
  | 'callType'
  | 'user'
  | 'date'

const PANEL_W = 288

function dateRangeSelectionCount(dateFrom: string, dateTo: string): number {
  let n = 0
  if (dateFrom.trim()) n += 1
  if (dateTo.trim()) n += 1
  return n
}

function pillLabel(base: string, count: number): string {
  return count > 0 ? `${base} · ${count}` : base
}

export function LlmUsageFilterBar(props: {
  openPopover: FilterPopoverKey | null
  setOpenPopover: (k: FilterPopoverKey | null) => void
  listSearch: string
  setListSearch: (s: string) => void
  mobileFiltersOpen: boolean
  setMobileFiltersOpen: (open: boolean) => void
  profile: MeResponse
  mode: 'admin' | 'studio' | 'me'
  filters: LlmUsageFilters
  updateFilters: (patch: Partial<LlmUsageFilters>) => void
  softwareOptions: { id: string; name: string; studio_id: string }[]
  projectOptions: { id: string; name: string }[]
  workOrders: { id: string; title: string }[]
  members:
    | { user_id: string; display_name: string | null; email: string }[]
    | undefined
  primaryProjectId: string
}): ReactElement {
  const {
    openPopover,
    setOpenPopover,
    listSearch,
    setListSearch,
    mobileFiltersOpen,
    setMobileFiltersOpen,
    profile,
    mode,
    filters,
    updateFilters,
    softwareOptions,
    projectOptions,
    workOrders,
    members,
    primaryProjectId,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const popoverPanelRef = useRef<HTMLDivElement>(null)
  const pillButtonRefs = useRef<
    Partial<Record<FilterPopoverKey, HTMLButtonElement | null>>
  >({})

  const assignPillRef =
    (key: FilterPopoverKey) => (el: HTMLButtonElement | null) => {
      pillButtonRefs.current[key] = el
    }

  const [popoverPoint, setPopoverPoint] = useState<{
    top: number
    left: number
  } | null>(null)

  const projectDisabled = filters.softwareIds.length === 0
  const workOrderDisabled = !primaryProjectId
  const showUserFilter = mode === 'studio' || mode === 'admin'

  const studioFiltered = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return profile.studios
    return profile.studios.filter(
      (s) =>
        s.studio_name.toLowerCase().includes(q) ||
        s.studio_id.toLowerCase().includes(q),
    )
  }, [profile.studios, listSearch])

  const softwareFiltered = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return softwareOptions
    return softwareOptions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    )
  }, [softwareOptions, listSearch])

  const projectFiltered = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return projectOptions
    return projectOptions.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    )
  }, [projectOptions, listSearch])

  const workOrderFiltered = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return workOrders
    return workOrders.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q),
    )
  }, [workOrders, listSearch])

  const callTypeFiltered = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return KNOWN_LLM_CALL_TYPES
    return KNOWN_LLM_CALL_TYPES.filter((ct) => {
      const label = llmCallTypeLabel(ct).toLowerCase()
      return label.includes(q) || ct.toLowerCase().includes(q)
    })
  }, [listSearch])

  const membersFiltered = useMemo(() => {
    if (!members) return []
    const q = listSearch.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const name = (m.display_name ?? '').toLowerCase()
      const em = m.email.toLowerCase()
      return (
        name.includes(q) ||
        em.includes(q) ||
        m.user_id.toLowerCase().includes(q)
      )
    })
  }, [members, listSearch])

  const measurePopover = useCallback(() => {
    if (!openPopover) {
      setPopoverPoint(null)
      return
    }
    if (openPopover === 'project' && projectDisabled) {
      setPopoverPoint(null)
      return
    }
    if (openPopover === 'workOrder' && workOrderDisabled) {
      setPopoverPoint(null)
      return
    }
    if (
      openPopover === 'user' &&
      (!showUserFilter || (mode === 'studio' && !members))
    ) {
      setPopoverPoint(null)
      return
    }

    const el = pillButtonRefs.current[openPopover]
    if (!el) {
      setPopoverPoint(null)
      return
    }

    const rect = el.getBoundingClientRect()
    const pad = 8
    let left = rect.left
    if (left + PANEL_W > window.innerWidth - pad) {
      left = window.innerWidth - PANEL_W - pad
    }
    if (left < pad) left = pad

    setPopoverPoint({
      top: rect.bottom + 6,
      left,
    })
  }, [
    openPopover,
    projectDisabled,
    workOrderDisabled,
    showUserFilter,
    mode,
    members,
  ])

  useLayoutEffect(() => {
    measurePopover()
  }, [measurePopover, filters, listSearch])

  useEffect(() => {
    if (!openPopover) return
    measurePopover()
    window.addEventListener('scroll', measurePopover, true)
    window.addEventListener('resize', measurePopover)
    return () => {
      window.removeEventListener('scroll', measurePopover, true)
      window.removeEventListener('resize', measurePopover)
    }
  }, [openPopover, measurePopover])

  useEffect(() => {
    if (openPopover === 'project' && projectDisabled) setOpenPopover(null)
    if (openPopover === 'workOrder' && workOrderDisabled) setOpenPopover(null)
  }, [
    openPopover,
    projectDisabled,
    workOrderDisabled,
    setOpenPopover,
  ])

  useEffect(() => {
    if (!openPopover) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (rootRef.current?.contains(t) || popoverPanelRef.current?.contains(t))
        return
      setOpenPopover(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openPopover, setOpenPopover])

  const togglePopover = (key: FilterPopoverKey) => {
    setOpenPopover(openPopover === key ? null : key)
  }

  const pillBtnClass = (active: boolean, disabled?: boolean): string =>
    [
      'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
      disabled
        ? 'pointer-events-none opacity-40'
        : active
          ? 'border-violet-500/60 bg-zinc-900 text-zinc-100 hover:border-violet-400'
          : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900',
    ].join(' ')

  const renderPortalPanelBody = (): ReactElement | null => {
    if (!openPopover) return null
    switch (openPopover) {
      case 'studio':
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() =>
                  updateFilters({
                    studioIds: [],
                    softwareIds: [],
                    projectIds: [],
                    workOrderIds: [],
                  })
                }
              >
                Clear
              </button>
            </div>
            <input
              type="search"
              placeholder="Search…"
              autoComplete="off"
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {studioFiltered.map((s) => {
                const checked = filters.studioIds.includes(s.studio_id)
                return (
                  <label
                    key={s.studio_id}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 rounded border-zinc-600"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.studioIds, s.studio_id].filter(
                              (x, i, a) => a.indexOf(x) === i,
                            )
                          : filters.studioIds.filter((x) => x !== s.studio_id)
                        updateFilters({ studioIds: next })
                      }}
                    />
                    <span className="min-w-0 break-words">{s.studio_name}</span>
                  </label>
                )
              })}
            </div>
          </>
        )
      case 'software':
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() =>
                  updateFilters({
                    softwareIds: [],
                    projectIds: [],
                    workOrderIds: [],
                  })
                }
              >
                Clear
              </button>
            </div>
            <input
              type="search"
              placeholder="Search…"
              autoComplete="off"
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {softwareFiltered.map((sw) => {
                const checked = filters.softwareIds.includes(sw.id)
                return (
                  <label
                    key={sw.id}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 rounded border-zinc-600"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.softwareIds, sw.id].filter(
                              (x, i, a) => a.indexOf(x) === i,
                            )
                          : filters.softwareIds.filter((x) => x !== sw.id)
                        updateFilters({
                          softwareIds: next,
                          projectIds: [],
                          workOrderIds: [],
                        })
                      }}
                    />
                    <span className="min-w-0 break-words">{sw.name}</span>
                  </label>
                )
              })}
            </div>
          </>
        )
      case 'project':
        if (projectDisabled) return null
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() =>
                  updateFilters({ projectIds: [], workOrderIds: [] })
                }
              >
                Clear
              </button>
            </div>
            <input
              type="search"
              placeholder="Search…"
              autoComplete="off"
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {projectFiltered.map((p) => {
                const checked = filters.projectIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 rounded border-zinc-600"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.projectIds, p.id].filter(
                              (x, i, a) => a.indexOf(x) === i,
                            )
                          : filters.projectIds.filter((x) => x !== p.id)
                        updateFilters({
                          projectIds: next,
                          workOrderIds: [],
                        })
                      }}
                    />
                    <span className="min-w-0 break-words">{p.name}</span>
                  </label>
                )
              })}
            </div>
          </>
        )
      case 'workOrder':
        if (workOrderDisabled) return null
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() => updateFilters({ workOrderIds: [] })}
              >
                Clear
              </button>
            </div>
            <input
              type="search"
              placeholder="Search…"
              autoComplete="off"
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {workOrderFiltered.map((w) => {
                const checked = filters.workOrderIds.includes(w.id)
                return (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 rounded border-zinc-600"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.workOrderIds, w.id].filter(
                              (x, i, a) => a.indexOf(x) === i,
                            )
                          : filters.workOrderIds.filter((x) => x !== w.id)
                        updateFilters({ workOrderIds: next })
                      }}
                    />
                    <span className="min-w-0 break-words">{w.title}</span>
                  </label>
                )
              })}
            </div>
          </>
        )
      case 'callType':
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() => updateFilters({ callTypes: [] })}
              >
                Clear
              </button>
            </div>
            <input
              type="search"
              placeholder="Search…"
              autoComplete="off"
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {callTypeFiltered.map((ct) => {
                const checked = filters.callTypes.includes(ct)
                return (
                  <label
                    key={ct}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 rounded border-zinc-600"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.callTypes, ct].filter(
                              (x, i, a) => a.indexOf(x) === i,
                            )
                          : filters.callTypes.filter((x) => x !== ct)
                        updateFilters({ callTypes: next })
                      }}
                    />
                    <span className="min-w-0 break-words">
                      {llmCallTypeLabel(ct)}
                    </span>
                  </label>
                )
              })}
            </div>
          </>
        )
      case 'user':
        if (!showUserFilter) return null
        if (mode === 'studio' && !members) return null
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() => updateFilters({ userIds: [] })}
              >
                Clear
              </button>
            </div>
            {mode === 'admin' ? (
              <textarea
                rows={5}
                placeholder="User IDs (comma or newline separated)"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200"
                value={filters.userIds.join(', ')}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(/[\s,]+/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                  updateFilters({ userIds: [...new Set(parts)] })
                }}
              />
            ) : (
              <>
                <input
                  type="search"
                  placeholder="Search…"
                  autoComplete="off"
                  className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                />
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {membersFiltered.map((m) => {
                    const checked = filters.userIds.includes(m.user_id)
                    const label = m.display_name?.trim() || m.email
                    return (
                      <label
                        key={m.user_id}
                        className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs text-zinc-300 hover:bg-zinc-900"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0 rounded border-zinc-600"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...filters.userIds, m.user_id].filter(
                                  (x, i, a) => a.indexOf(x) === i,
                                )
                              : filters.userIds.filter((x) => x !== m.user_id)
                            updateFilters({ userIds: next })
                          }}
                        />
                        <span className="min-w-0 break-words">{label}</span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )
      case 'date':
        return (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-violet-400 hover:text-violet-300"
                onClick={() => updateFilters({ dateFrom: '', dateTo: '' })}
              >
                Clear
              </button>
            </div>
            <label className="mb-2 flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Date from
              </span>
              <input
                type="date"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                value={filters.dateFrom}
                onChange={(e) =>
                  updateFilters({ dateFrom: e.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                Date to
              </span>
              <input
                type="date"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                value={filters.dateTo}
                onChange={(e) =>
                  updateFilters({ dateTo: e.target.value })
                }
              />
            </label>
          </>
        )
      default:
        return null
    }
  }

  const renderPillRow = (): ReactElement => (
    <div className="flex max-h-14 min-h-9 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-visible py-1">
      <button
        type="button"
        ref={assignPillRef('studio')}
        data-testid="filter-pill-studio"
        aria-expanded={openPopover === 'studio'}
        aria-haspopup="dialog"
        className={pillBtnClass(filters.studioIds.length > 0)}
        onClick={() => togglePopover('studio')}
      >
        {pillLabel('Studio', filters.studioIds.length)}
      </button>
      <button
        type="button"
        ref={assignPillRef('software')}
        data-testid="filter-pill-software"
        disabled={profile.studios.length === 0}
        aria-expanded={openPopover === 'software'}
        className={pillBtnClass(
          filters.softwareIds.length > 0,
          profile.studios.length === 0,
        )}
        onClick={() => togglePopover('software')}
      >
        {pillLabel('Software', filters.softwareIds.length)}
      </button>
      <button
        type="button"
        ref={assignPillRef('project')}
        data-testid="filter-pill-project"
        disabled={projectDisabled}
        aria-expanded={openPopover === 'project'}
        className={pillBtnClass(filters.projectIds.length > 0, projectDisabled)}
        onClick={() => togglePopover('project')}
      >
        {pillLabel('Project', filters.projectIds.length)}
      </button>
      <button
        type="button"
        ref={assignPillRef('workOrder')}
        data-testid="filter-pill-work-order"
        disabled={workOrderDisabled}
        aria-expanded={openPopover === 'workOrder'}
        className={pillBtnClass(
          filters.workOrderIds.length > 0,
          workOrderDisabled,
        )}
        onClick={() => togglePopover('workOrder')}
      >
        {pillLabel('Work order', filters.workOrderIds.length)}
      </button>
      <button
        type="button"
        ref={assignPillRef('callType')}
        data-testid="filter-pill-call-type"
        aria-expanded={openPopover === 'callType'}
        className={pillBtnClass(filters.callTypes.length > 0)}
        onClick={() => togglePopover('callType')}
      >
        {pillLabel('Call type', filters.callTypes.length)}
      </button>
      {showUserFilter ? (
        <button
          type="button"
          ref={assignPillRef('user')}
          data-testid="filter-pill-user"
          disabled={mode === 'studio' && !members}
          aria-expanded={openPopover === 'user'}
          className={pillBtnClass(
            filters.userIds.length > 0,
            mode === 'studio' && !members,
          )}
          onClick={() => togglePopover('user')}
        >
          {pillLabel('User', filters.userIds.length)}
        </button>
      ) : null}
      <button
        type="button"
        ref={assignPillRef('date')}
        data-testid="filter-pill-date-range"
        aria-expanded={openPopover === 'date'}
        className={pillBtnClass(
          dateRangeSelectionCount(filters.dateFrom, filters.dateTo) > 0,
        )}
        onClick={() => togglePopover('date')}
      >
        {pillLabel(
          'Date range',
          dateRangeSelectionCount(filters.dateFrom, filters.dateTo),
        )}
      </button>
    </div>
  )

  const panelBody = renderPortalPanelBody()

  const portalNode =
    typeof document !== 'undefined' &&
    openPopover &&
    popoverPoint &&
    panelBody ? (
      createPortal(
        <div
          ref={popoverPanelRef}
          role="dialog"
          style={{
            position: 'fixed',
            top: popoverPoint.top,
            left: popoverPoint.left,
            width: PANEL_W,
          }}
          className="z-[200] max-h-[min(24rem,calc(100vh-12px))] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-xl shadow-black/40"
        >
          {panelBody}
        </div>,
        document.body,
      )
    ) : null

  return (
    <>
      <div ref={rootRef} className="relative">
        <div className="md:hidden">
          <button
            type="button"
            data-testid="filters-mobile-toggle"
            aria-expanded={mobileFiltersOpen}
            className="inline-flex h-9 min-h-9 w-full max-w-full items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 px-4 text-xs font-medium text-zinc-200 hover:border-zinc-600"
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          >
            Filters
            {(() => {
              const n =
                filters.studioIds.length +
                filters.softwareIds.length +
                filters.projectIds.length +
                filters.workOrderIds.length +
                filters.callTypes.length +
                filters.userIds.length +
                dateRangeSelectionCount(filters.dateFrom, filters.dateTo)
              return n > 0 ? (
                <span className="ml-2 rounded-full bg-violet-600 px-2 py-px text-[10px] text-white">
                  {n}
                </span>
              ) : null
            })()}
          </button>
          {mobileFiltersOpen ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              {renderPillRow()}
            </div>
          ) : null}
        </div>
        <div className="hidden md:block">{renderPillRow()}</div>
      </div>
      {portalNode}
    </>
  )
}
