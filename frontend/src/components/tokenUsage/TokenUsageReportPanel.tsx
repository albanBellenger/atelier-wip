import { useMutation } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  type TokenUsageQueryParams,
  type TokenUsageReport,
  type TokenUsageRow,
  downloadMeTokenUsageCsv,
  downloadStudioTokenUsageCsv,
  downloadBlob,
  getMeTokenUsage,
  getStudioTokenUsage,
} from '../../services/api'

type Mode = 'studio' | 'me'

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

export function TokenUsageReportPanel(props: {
  mode: Mode
  studioId?: string
}): ReactElement {
  const { mode, studioId } = props
  const [searchParams] = useSearchParams()
  const urlFiltersApplied = useRef(false)
  const [softwareId, setSoftwareId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [studioFilterId, setStudioFilterId] = useState('')
  const [callSource, setCallSource] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [limit, setLimit] = useState(100)
  const [offset, setOffset] = useState(0)
  const [report, setReport] = useState<TokenUsageReport | null>(null)
  const [chartGranularity, setChartGranularity] =
    useState<Granularity>('day')

  useEffect(() => {
    if (urlFiltersApplied.current || mode !== 'me') return
    urlFiltersApplied.current = true
    const sw = searchParams.get('software_id')?.trim() ?? ''
    const pj = searchParams.get('project_id')?.trim() ?? ''
    const st = searchParams.get('studio_id')?.trim() ?? ''
    if (sw) setSoftwareId(sw)
    if (pj) setProjectId(pj)
    if (st) setStudioFilterId(st)
  }, [mode, searchParams])

  const chartData = useMemo(() => {
    if (!report?.rows?.length) return []
    return aggregateUsageByGranularity(report.rows, chartGranularity)
  }, [report, chartGranularity])

  function buildParams(): TokenUsageQueryParams {
    const p: TokenUsageQueryParams = { limit, offset }
    if (softwareId.trim()) p.software_id = softwareId.trim()
    if (projectId.trim()) p.project_id = projectId.trim()
    if (mode === 'me' && studioFilterId.trim()) p.studio_id = studioFilterId.trim()
    if (callSource.trim()) p.call_source = callSource.trim()
    if (dateFrom.trim()) p.date_from = dateFrom.trim()
    if (dateTo.trim()) p.date_to = dateTo.trim()
    return p
  }

  const loadMut = useMutation({
    mutationFn: async (): Promise<TokenUsageReport> => {
      const p = buildParams()
      if (mode === 'studio') {
        if (!studioId) throw new Error('studioId required')
        return getStudioTokenUsage(studioId, p)
      }
      return getMeTokenUsage(p)
    },
    onSuccess: (r) => setReport(r),
  })

  const csvMut = useMutation({
    mutationFn: async (): Promise<Blob> => {
      const p = buildParams()
      if (mode === 'studio') {
        if (!studioId) throw new Error('studioId required')
        return downloadStudioTokenUsageCsv(studioId, p)
      }
      return downloadMeTokenUsageCsv(p)
    },
    onSuccess: (blob) => {
      const name = mode === 'studio' ? 'studio-token-usage.csv' : 'my-token-usage.csv'
      downloadBlob(blob, name)
    },
  })

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
            Usage trend (UTC) — appears here above filters after you load data.
          </p>
        )}
      </div>

      <div className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Software ID</span>
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs"
            value={softwareId}
            onChange={(e) => setSoftwareId(e.target.value)}
            placeholder="UUID"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Project ID</span>
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="UUID"
          />
        </label>
        {mode === 'me' ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Studio ID</span>
            <input
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs"
              value={studioFilterId}
              onChange={(e) => setStudioFilterId(e.target.value)}
              placeholder="UUID"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Source</span>
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
            value={callSource}
            onChange={(e) => setCallSource(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Date from</span>
          <input
            type="date"
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Date to</span>
          <input
            type="date"
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Limit</span>
          <input
            type="number"
            min={1}
            max={5000}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 100)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Offset</span>
          <input
            type="number"
            min={0}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loadMut.isPending}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          onClick={() => loadMut.mutate()}
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
      {!report && !loadMut.isPending && !loadMut.isError && (
        <p className="text-sm text-zinc-500">
          Set filters and click &quot;Apply filters&quot; to load rows.
        </p>
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
              <span className="text-zinc-200">{report.totals.input_tokens}</span>{' '}
              · Output tokens:{' '}
              <span className="text-zinc-200">{report.totals.output_tokens}</span>{' '}
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
                  <th className="p-2">User</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r: TokenUsageRow) => (
                  <tr key={r.id} className="border-b border-zinc-800/80">
                    <td className="whitespace-nowrap p-2 text-zinc-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-2">{r.call_source}</td>
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
                      {r.user_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
