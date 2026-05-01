import type { TokenUsageRow } from '../services/api'

export const DISPLAY_TOKEN_BUDGET = 2_000_000

export function rowTokenTotal(row: TokenUsageRow): number {
  return row.input_tokens + row.output_tokens
}

/** Map backend ``call_type`` to wireframe-style categories (fixed order). */
export function bucketKeyForCallType(callType: string): string {
  if (
    callType === 'private_thread' ||
    callType.startsWith('thread_patch_')
  ) {
    return 'private_threads'
  }
  if (callType === 'chat') return 'project_chat'
  if (callType === 'work_order_gen') return 'work_order_gen'
  if (
    callType === 'conflict' ||
    callType === 'drift' ||
    callType === 'thread_conflict_scan'
  ) {
    return 'conflict_drift'
  }
  if (callType === 'graph') return 'knowledge_graph'
  return 'other'
}

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'private_threads', label: 'Private threads' },
  { key: 'project_chat', label: 'Project chat' },
  { key: 'work_order_gen', label: 'Work Order generation' },
  { key: 'conflict_drift', label: 'Conflict & drift' },
  { key: 'knowledge_graph', label: 'Knowledge graph' },
]

export type CategoryBreakdownRow = {
  key: string
  label: string
  tokens: number
}

export function categoryBreakdownFromRows(
  rows: TokenUsageRow[],
): CategoryBreakdownRow[] {
  const sums = new Map<string, number>()
  for (const k of CATEGORY_ORDER.map((c) => c.key)) {
    sums.set(k, 0)
  }
  sums.set('other', 0)
  for (const r of rows) {
    const b = bucketKeyForCallType(r.call_type)
    const t = rowTokenTotal(r)
    sums.set(b, (sums.get(b) ?? 0) + t)
  }
  const main = CATEGORY_ORDER.map(({ key, label }) => ({
    key,
    label,
    tokens: sums.get(key) ?? 0,
  }))
  const otherTok = sums.get('other') ?? 0
  if (otherTok > 0) {
    main.push({ key: 'other', label: 'Other', tokens: otherTok })
  }
  return main
}

/** 14 entries, oldest → newest (index 0 = start of window). */
export function last14LocalDayTotals(
  rows: TokenUsageRow[],
  now: Date = new Date(),
): number[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - 13)
  const keys: string[] = []
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    keys.push(localDayKey(d))
  }
  const byDay = new Map<string, number>()
  for (const k of keys) byDay.set(k, 0)
  for (const r of rows) {
    const d = new Date(r.created_at)
    const k = localDayKey(d)
    if (byDay.has(k)) {
      byDay.set(k, (byDay.get(k) ?? 0) + rowTokenTotal(r))
    }
  }
  return keys.map((k) => byDay.get(k) ?? 0)
}

function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayAndYesterdayFromRows(
  rows: TokenUsageRow[],
  now: Date = new Date(),
): { today: number; yesterday: number } {
  const tKey = localDayKey(now)
  const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yKey = localDayKey(yd)
  let today = 0
  let yesterday = 0
  for (const r of rows) {
    const k = localDayKey(new Date(r.created_at))
    const n = rowTokenTotal(r)
    if (k === tKey) today += n
    else if (k === yKey) yesterday += n
  }
  return { today, yesterday }
}

export function parseCostUsd(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
