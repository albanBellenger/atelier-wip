import { describe, expect, it } from 'vitest'

import {
  bucketKeyForCallType,
  categoryBreakdownFromRows,
  last14LocalDayTotals,
  rowTokenTotal,
  todayAndYesterdayFromRows,
} from './tokenUsageHomeLayout'
import type { TokenUsageRow } from '../services/api'

function row(
  partial: Partial<TokenUsageRow> & Pick<TokenUsageRow, 'call_type' | 'created_at'>,
): TokenUsageRow {
  return {
    id: '1',
    studio_id: null,
    software_id: null,
    project_id: null,
    user_id: null,
    model: 'm',
    input_tokens: 1,
    output_tokens: 1,
    estimated_cost_usd: null,
    ...partial,
  }
}

describe('tokenUsageHomeLayout', () => {
  it('rowTokenTotal sums in+out', () => {
    expect(rowTokenTotal(row({ call_type: 'chat', created_at: 'x', input_tokens: 3, output_tokens: 7 }))).toBe(10)
  })

  it('bucketKeyForCallType groups thread patches', () => {
    expect(bucketKeyForCallType('private_thread')).toBe('private_threads')
    expect(bucketKeyForCallType('thread_patch_append')).toBe('private_threads')
    expect(bucketKeyForCallType('chat')).toBe('project_chat')
    expect(bucketKeyForCallType('drift')).toBe('conflict_drift')
    expect(bucketKeyForCallType('graph')).toBe('knowledge_graph')
    expect(bucketKeyForCallType('rag_x')).toBe('other')
  })

  it('categoryBreakdownFromRows aggregates fixed categories', () => {
    const rows: TokenUsageRow[] = [
      row({ call_type: 'private_thread', created_at: '2026-05-01T10:00:00Z', input_tokens: 10, output_tokens: 0 }),
      row({ call_type: 'chat', created_at: '2026-05-01T10:00:00Z', input_tokens: 5, output_tokens: 5 }),
      row({ call_type: 'unknown', created_at: '2026-05-01T10:00:00Z', input_tokens: 2, output_tokens: 0 }),
    ]
    const b = categoryBreakdownFromRows(rows)
    expect(b.find((x) => x.key === 'private_threads')?.tokens).toBe(10)
    expect(b.find((x) => x.key === 'project_chat')?.tokens).toBe(10)
    expect(b.find((x) => x.key === 'knowledge_graph')?.tokens).toBe(0)
    expect(b.find((x) => x.key === 'other')?.tokens).toBe(2)
  })

  it('last14LocalDayTotals buckets by local calendar day', () => {
    const fixed = new Date(2026, 4, 10, 12, 0, 0)
    const dToday = new Date(2026, 4, 10, 10, 0, 0)
    const dYest = new Date(2026, 4, 9, 10, 0, 0)
    const rows = [
      row({
        call_type: 'chat',
        created_at: dToday.toISOString(),
        input_tokens: 100,
        output_tokens: 0,
      }),
      row({
        call_type: 'chat',
        created_at: dYest.toISOString(),
        input_tokens: 50,
        output_tokens: 0,
      }),
    ]
    const totals = last14LocalDayTotals(rows, fixed)
    expect(totals).toHaveLength(14)
    expect(totals.reduce((a, b) => a + b, 0)).toBe(150)
  })

  it('todayAndYesterdayFromRows', () => {
    const fixed = new Date(2026, 4, 10, 15, 0, 0)
    const dToday = new Date(2026, 4, 10, 10, 0, 0)
    const dYest = new Date(2026, 4, 9, 10, 0, 0)
    const rows = [
      row({
        call_type: 'chat',
        created_at: dToday.toISOString(),
        input_tokens: 40,
        output_tokens: 0,
      }),
      row({
        call_type: 'chat',
        created_at: dYest.toISOString(),
        input_tokens: 60,
        output_tokens: 0,
      }),
    ]
    expect(todayAndYesterdayFromRows(rows, fixed)).toEqual({
      today: 40,
      yesterday: 60,
    })
  })
})
