import type { WorkOrder } from '../services/api'

/** Sort within a single Kanban status column: phase_order asc, then phase name, then title. */
export function compareWorkOrdersKanban(a: WorkOrder, b: WorkOrder): number {
  const oa = a.phase_order
  const ob = b.phase_order
  if (oa != null && ob != null && oa !== ob) {
    return oa - ob
  }
  if (oa != null && ob == null) {
    return -1
  }
  if (oa == null && ob != null) {
    return 1
  }
  const pa = a.phase ?? ''
  const pb = b.phase ?? ''
  if (pa !== pb) {
    return pa.localeCompare(pb)
  }
  return a.title.localeCompare(b.title)
}
