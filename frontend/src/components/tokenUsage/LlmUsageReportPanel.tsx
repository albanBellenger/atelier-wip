import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { llmCallSourceLabel } from '../../lib/llmCallSourceLabels'
import { deriveLlmUsageReportMode } from '../../lib/llmUsageReportMode'
import {
  type FilterPopoverKey,
  LlmUsageFilterBar,
} from './LlmUsageFilterBar'
import {
  type MeResponse,
  type TokenUsageQueryParams,
  type TokenUsageReport,
  type TokenUsageRow,
  downloadMeTokenUsageCsv,
  downloadStudioTokenUsageCsv,
  downloadBlob,
  getMeTokenUsage,
  getStudioTokenUsage,
  listMembers,
  listProjects,
  listSoftware,
  listWorkOrders,
} from '../../services/api'

type Granularity = 'day' | 'week' | 'month'

function utcWeekStartKey(d: Date): string {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
  const day = t.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  t.setUTCDate(t.getUTCDate() + diff)
  return t.toISOString().slice(0, 10)
}

function aggregateUsageByGranularity(
  rows: TokenUsageRow[],
  granularity: Granularity,
): { label: string; tokens: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.created_at)
    let key: string
    if (granularity === 'day') {
      key = d.toISOString().slice(0, 10)
    } else if (granularity === 'week') {
      key = utcWeekStartKey(d)
    } else {
      key = d.toISOString().slice(0, 7)
    }
    const v = r.input_tokens + r.output_tokens
    map.set(key, (map.get(key) ?? 0) + v)
  }
  const keys = [...map.keys()].sort()
  return keys.map((k) => ({
    label: k,
    tokens: map.get(k) ?? 0,
  }))
}

function readMultiParam(sp: URLSearchParams, key: string): string[] {
  const raw = sp.getAll(key).map((x) => x.trim()).filter(Boolean)
  return [...new Set(raw)]
}

function filtersToSearchParams(f: {
  studioIds: string[]
  softwareIds: string[]
  projectIds: string[]
  workOrderIds: string[]
  userIds: string[]
  callSources: string[]
  dateFrom: string
  dateTo: string
  limit: number
  offset: number
}): string {
  const sp = new URLSearchParams()
  for (const id of f.studioIds) sp.append('studio_id', id)
  for (const id of f.softwareIds) sp.append('software_id', id)
  for (const id of f.projectIds) sp.append('project_id', id)
  for (const id of f.workOrderIds) sp.append('work_order_id', id)
  for (const id of f.userIds) sp.append('user_id', id)
  for (const c of f.callSources) sp.append('call_source', c)
  if (f.dateFrom.trim()) sp.set('date_from', f.dateFrom.trim())
  if (f.dateTo.trim()) sp.set('date_to', f.dateTo.trim())
  sp.set('limit', String(f.limit))
  sp.set('offset', String(f.offset))
  const q = sp.toString()
  return q ? `?${q}` : ''
}

function parseFiltersFromSearch(sp: URLSearchParams): {
  studioIds: string[]
  softwareIds: string[]
  projectIds: string[]
  workOrderIds: string[]
  userIds: string[]
  callSources: string[]
  dateFrom: string
  dateTo: string
  limit: number
  offset: number
} {
  return {
    studioIds: readMultiParam(sp, 'studio_id'),
    softwareIds: readMultiParam(sp, 'software_id'),
    projectIds: readMultiParam(sp, 'project_id'),
    workOrderIds: readMultiParam(sp, 'work_order_id'),
    userIds: readMultiParam(sp, 'user_id'),
    callSources: readMultiParam(sp, 'call_source'),
    dateFrom: sp.get('date_from')?.trim() ?? '',
    dateTo: sp.get('date_to')?.trim() ?? '',
    limit: Math.min(5000, Math.max(1, Number(sp.get('limit')) || 100)),
    offset: Math.max(0, Number(sp.get('offset')) || 0),
  }
}

function buildApiParams(f: {
  studioIds: string[]
  softwareIds: string[]
  projectIds: string[]
  workOrderIds: string[]
  userIds: string[]
  callSources: string[]
  dateFrom: string
  dateTo: string
  limit: number
  offset: number
}): TokenUsageQueryParams {
  const p: TokenUsageQueryParams = { limit: f.limit, offset: f.offset }
  if (f.studioIds.length) p.studio_id = f.studioIds
  if (f.softwareIds.length) p.software_id = f.softwareIds
  if (f.projectIds.length) p.project_id = f.projectIds
  if (f.workOrderIds.length) p.work_order_id = f.workOrderIds
  if (f.userIds.length) p.user_id = f.userIds
  if (f.callSources.length) p.call_source = f.callSources
  if (f.dateFrom.trim()) p.date_from = f.dateFrom.trim()
  if (f.dateTo.trim()) p.date_to = f.dateTo.trim()
  return p
}

export function LlmUsageReportPanel(props: {
  profile: MeResponse
}): ReactElement {
  const { profile } = props
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [filters, setFilters] = useState(() =>
    parseFiltersFromSearch(searchParams),
  )

  const derivedMode = useMemo(
    () => deriveLlmUsageReportMode(profile, filters.studioIds),
    [profile, filters.studioIds],
  )
  const { mode, studioId } = derivedMode

  const pushUrl = useCallback(
    (next: typeof filters) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        const qs = filtersToSearchParams(next)
        navigate({ pathname: '/llm-usage', search: qs }, { replace: true })
      }, 280)
    },
    [navigate],
  )

  const updateFilters = useCallback(
    (patch: Partial<typeof filters>) => {
      setFilters((prev) => {
        const merged = { ...prev, ...patch }
        pushUrl(merged)
        return merged
      })
    },
    [pushUrl],
  )

  const studioIdsForSoftware = useMemo(() => {
    if (filters.studioIds.length > 0) return filters.studioIds
    return profile.studios.map((s) => s.studio_id)
  }, [filters.studioIds, profile.studios])

  const softwareQueries = useQueries({
    queries: studioIdsForSoftware.map((sid) => ({
      queryKey: ['studios', sid, 'software', 'llm-usage'],
      queryFn: () => listSoftware(sid),
      enabled: Boolean(sid),
    })),
  })

  const softwareOptions = useMemo(() => {
    const rows: { id: string; name: string; studio_id: string }[] = []
    for (const q of softwareQueries) {
      if (!q.data) continue
      for (const sw of q.data) {
        rows.push({
          id: sw.id,
          name: sw.name,
          studio_id: sw.studio_id ?? '',
        })
      }
    }
    const seen = new Set<string>()
    return rows.filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
  }, [softwareQueries])

  const projectQueries = useQueries({
    queries: filters.softwareIds.map((sfid) => ({
      queryKey: ['software', sfid, 'projects', 'llm-usage'],
      queryFn: () => listProjects(sfid),
      enabled: Boolean(sfid),
    })),
  })

  const projectOptions = useMemo(() => {
    const rows: { id: string; name: string }[] = []
    for (const q of projectQueries) {
      if (!q.data) continue
      for (const p of q.data) {
        rows.push({ id: p.id, name: p.name })
      }
    }
    const seen = new Set<string>()
    return rows.filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
  }, [projectQueries])

  const primaryProjectId =
    filters.projectIds.length === 1 ? filters.projectIds[0] : ''

  const workOrdersQ = useQuery({
    queryKey: ['project', primaryProjectId, 'workOrders', 'llm-usage'],
    queryFn: () => listWorkOrders(primaryProjectId),
    enabled: Boolean(primaryProjectId),
  })

  const membersQ = useQuery({
    queryKey: ['members', studioId, 'llm-usage'],
    queryFn: () => listMembers(studioId!),
    enabled: mode === 'studio' && Boolean(studioId),
  })

  const [report, setReport] = useState<TokenUsageReport | null>(null)
  const [chartGranularity, setChartGranularity] =
    useState<Granularity>('day')

  const chartData = useMemo(() => {
    if (!report?.rows?.length) return []
    return aggregateUsageByGranularity(report.rows, chartGranularity)
  }, [report, chartGranularity])

  const loadMut = useMutation({
    mutationFn: async (
      f: ReturnType<typeof parseFiltersFromSearch>,
    ): Promise<TokenUsageReport> => {
      const { mode: m, studioId: sid } = deriveLlmUsageReportMode(
        profile,
        f.studioIds,
      )
      const base = buildApiParams(f)
      if (m === 'studio' && sid) {
        const { studio_id: _s, ...rest } = base
        return getStudioTokenUsage(sid, rest)
      }
      const { user_id: _u, ...meRest } = base
      return getMeTokenUsage(meRest)
    },
    onSuccess: (r) => setReport(r),
  })

  const csvMut = useMutation({
    mutationFn: async (): Promise<Blob> => {
      const { mode: m, studioId: sid } = deriveLlmUsageReportMode(
        profile,
        filters.studioIds,
      )
      const base = buildApiParams(filters)
      if (m === 'studio' && sid) {
        const { studio_id: _s, ...rest } = base
        return downloadStudioTokenUsageCsv(sid, rest)
      }
      const { user_id: _u, ...meRest } = base
      return downloadMeTokenUsageCsv(meRest)
    },
    onSuccess: (blob) => {
      const { mode: m } = deriveLlmUsageReportMode(
        profile,
        filters.studioIds,
      )
      const name =
        m === 'studio' ? 'studio-token-usage.csv' : 'my-token-usage.csv'
      downloadBlob(blob, name)
    },
  })

  useEffect(() => {
    const f = parseFiltersFromSearch(searchParams)
    setFilters(f)
    loadMut.mutate(f)
    // loadMut.mutate identity is stable; avoid re-running when mutation object reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const [openPopover, setOpenPopover] = useState<FilterPopoverKey | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    setListSearch('')
  }, [openPopover])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        {report ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-300">
                Usage trend (UTC)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="granularity-daily"
                  className={`rounded px-3 py-1 text-xs ${
                    chartGranularity === 'day'
                      ? 'bg-violet-600 text-white'
                      : 'border border-zinc-600 text-zinc-300 hover:bg-zinc-800'
                  }`}
                  onClick={() => setChartGranularity('day')}
                >
                  Daily
                </button>
                <button
                  type="button"
                  data-testid="granularity-weekly"
                  className={`rounded px-3 py-1 text-xs ${
                    chartGranularity === 'week'
                      ? 'bg-violet-600 text-white'
                      : 'border border-zinc-600 text-zinc-300 hover:bg-zinc-800'
                  }`}
                  onClick={() => setChartGranularity('week')}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  data-testid="granularity-monthly"
                  className={`rounded px-3 py-1 text-xs ${
                    chartGranularity === 'month'
                      ? 'bg-violet-600 text-white'
                      : 'border border-zinc-600 text-zinc-300 hover:bg-zinc-800'
                  }`}
                  onClick={() => setChartGranularity('month')}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div data-testid="usage-chart" className="w-full min-w-0 overflow-x-auto">
              <ResponsiveContainer width={720} height={256}>
                <BarChart data={chartData} margin={{ bottom: 8, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} width={44} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#e4e4e7' }}
                  />
                  <Bar dataKey="tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Usage trend (UTC) — appears after you load data.
          </p>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Data source:{' '}
        <span className="font-mono text-zinc-400">
          {mode === 'studio'
            ? `/studios/${studioId ?? ''}/token-usage`
            : '/me/token-usage'}
        </span>
        {mode === 'me' && filters.userIds.length > 0 ? (
          <span className="ml-2 text-amber-500/90">
            (user filter ignored — not permitted for this scope)
          </span>
        ) : null}
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-1">
        <LlmUsageFilterBar
          openPopover={openPopover}
          setOpenPopover={setOpenPopover}
          listSearch={listSearch}
          setListSearch={setListSearch}
          mobileFiltersOpen={mobileFiltersOpen}
          setMobileFiltersOpen={setMobileFiltersOpen}
          profile={profile}
          mode={mode}
          filters={filters}
          updateFilters={updateFilters}
          softwareOptions={softwareOptions}
          projectOptions={projectOptions}
          workOrders={workOrdersQ.data ?? []}
          members={membersQ.data}
          primaryProjectId={primaryProjectId}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loadMut.isPending}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          onClick={() => loadMut.mutate(filters)}
        >
          {loadMut.isPending ? 'Loading…' : 'Apply filters'}
        </button>
        <button
          type="button"
          disabled={csvMut.isPending}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          onClick={() => csvMut.mutate()}
        >
          {csvMut.isPending ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {loadMut.isError && (
        <p className="text-sm text-red-400">Could not load token usage.</p>
      )}
      {csvMut.isError && (
        <p className="text-sm text-red-400">CSV export failed.</p>
      )}

      {report && (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
            <p className="font-medium text-zinc-300">Totals</p>
            <p className="mt-2 text-zinc-400">
              Input tokens:{' '}
              <span className="tabular-nums text-zinc-200">
                {report.totals.input_tokens.toLocaleString()}
              </span>{' '}
              · Output tokens:{' '}
              <span className="tabular-nums text-zinc-200">
                {report.totals.output_tokens.toLocaleString()}
              </span>{' '}
              · Est. USD:{' '}
              <span className="text-zinc-200">
                {report.totals.estimated_cost_usd}
              </span>
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase text-zinc-500">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">In</th>
                  <th className="p-2">Out</th>
                  <th className="p-2">USD</th>
                  <th className="p-2">Studio</th>
                  <th className="p-2">Software</th>
                  <th className="p-2">Project</th>
                  <th className="p-2">Work order</th>
                  <th className="p-2">User</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r: TokenUsageRow) => (
                  <tr key={r.id} className="border-b border-zinc-800/80">
                    <td className="whitespace-nowrap p-2 text-zinc-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-2" title={r.call_source}>
                      {llmCallSourceLabel(r.call_source)}
                    </td>
                    <td className="max-w-[140px] truncate p-2">{r.model}</td>
                    <td className="p-2">{r.input_tokens}</td>
                    <td className="p-2">{r.output_tokens}</td>
                    <td className="p-2">{r.estimated_cost_usd ?? '—'}</td>
                    <td className="max-w-[100px] truncate p-2 font-mono text-[10px]">
                      {r.studio_id ?? '—'}
                    </td>
                    <td className="max-w-[100px] truncate p-2 font-mono text-[10px]">
                      {r.software_id ?? '—'}
                    </td>
                    <td className="max-w-[100px] truncate p-2 font-mono text-[10px]">
                      {r.project_id ?? '—'}
                    </td>
                    <td className="max-w-[100px] truncate p-2 font-mono text-[10px]">
                      {r.work_order_id ?? '—'}
                    </td>
                    <td className="max-w-[100px] truncate p-2 font-mono text-[10px]">
                      {r.user_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
        <summary className="cursor-pointer select-none text-xs font-medium text-zinc-400 hover:text-zinc-200">
          Advanced
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Limit</span>
            <input
              type="number"
              min={1}
              max={5000}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
              value={filters.limit}
              onChange={(e) =>
                updateFilters({ limit: Number(e.target.value) || 100 })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Offset</span>
            <input
              type="number"
              min={0}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
              value={filters.offset}
              onChange={(e) =>
                updateFilters({ offset: Number(e.target.value) || 0 })
              }
            />
          </label>
        </div>
      </details>
    </div>
  )
}
