import { describe, expect, it } from 'vitest'

import { compareWorkOrdersKanban } from '../lib/workOrderKanbanSort'
import type { WorkOrder } from '../services/api'

function wo(
  partial: Pick<WorkOrder, 'id' | 'title' | 'phase' | 'phase_order'>,
): WorkOrder {
  return {
    id: partial.id,
    project_id: 'p',
    title: partial.title,
    description: '',
    implementation_guide: null,
    acceptance_criteria: null,
    status: 'backlog',
    phase: partial.phase,
    phase_order: partial.phase_order ?? null,
    assignee_id: null,
    assignee_display_name: null,
    is_stale: false,
    stale_reason: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    section_ids: [],
  }
}

describe('compareWorkOrdersKanban', () => {
  it('sorts by phase_order ascending', () => {
    const a = wo({ id: '1', title: 'a', phase: 'P1', phase_order: 2 })
    const b = wo({ id: '2', title: 'b', phase: 'P1', phase_order: 1 })
    const xs = [a, b].sort(compareWorkOrdersKanban)
    expect(xs.map((x) => x.id)).toEqual(['2', '1'])
  })

  it('null phase_order falls back to phase then title', () => {
    const a = wo({ id: '1', title: 'zebra', phase: 'B', phase_order: null })
    const b = wo({ id: '2', title: 'apple', phase: 'A', phase_order: null })
    const xs = [a, b].sort(compareWorkOrdersKanban)
    expect(xs.map((x) => x.id)).toEqual(['2', '1'])
  })

  it('orders non-null phase_order before null', () => {
    const a = wo({ id: '1', title: 'x', phase: 'P', phase_order: null })
    const b = wo({ id: '2', title: 'y', phase: 'P', phase_order: 1 })
    const xs = [a, b].sort(compareWorkOrdersKanban)
    expect(xs.map((x) => x.id)).toEqual(['2', '1'])
  })
})
