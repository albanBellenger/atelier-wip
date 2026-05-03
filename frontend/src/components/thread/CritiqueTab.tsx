import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import { listProjectIssues, listWorkOrders } from '../../services/api'

/** Issues and work orders scoped to the current section (Slice C). */
export function CritiqueTab(props: {
  projectId: string
  sectionId: string
  projectHref: string
}): ReactElement {
  const { projectId, sectionId, projectHref } = props

  const issuesQ = useQuery({
    queryKey: ['projectIssues', projectId, sectionId],
    queryFn: () => listProjectIssues(projectId, { sectionId }),
    enabled: Boolean(projectId && sectionId),
  })

  const woQ = useQuery({
    queryKey: ['workOrders', projectId, 'section', sectionId],
    queryFn: () =>
      listWorkOrders(projectId, { section_id: sectionId }),
    enabled: Boolean(projectId && sectionId),
  })

  const staleOrders = (woQ.data ?? []).filter((w) => w.is_stale)
  const reconcileBase = `${projectHref}/work-orders`

  return (
    <div
      className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto px-3 py-2 text-sm"
      data-testid="critique-tab"
    >
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Drift
        </h3>
        {woQ.isPending && (
          <p className="text-zinc-500">Loading work orders…</p>
        )}
        {woQ.isError && (
          <p className="text-red-300">Could not load work orders.</p>
        )}
        {woQ.data && staleOrders.length === 0 && (
          <p className="text-zinc-500">No stale work orders for this section.</p>
        )}
        {staleOrders.length > 0 && (
          <ul className="mt-1 space-y-2">
            {staleOrders.map((wo) => (
              <li
                key={wo.id}
                className="rounded border border-amber-900/30 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-100"
              >
                <span className="font-medium text-amber-200">{wo.title}</span>
                {wo.stale_reason ? (
                  <p className="mt-0.5 text-amber-100/80">{wo.stale_reason}</p>
                ) : null}
                <Link
                  to={reconcileBase}
                  className="mt-1 inline-block text-violet-400 hover:underline"
                >
                  Reconcile
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Issues
        </h3>
        {issuesQ.isPending && (
          <p className="text-zinc-500">Loading issues…</p>
        )}
        {issuesQ.isError && (
          <p className="text-amber-200/90">
            Issues unavailable (role or cross-studio policy).
          </p>
        )}
        {issuesQ.data && issuesQ.data.length === 0 && (
          <p className="text-zinc-500">No issues for this section.</p>
        )}
        {issuesQ.data && issuesQ.data.length > 0 && (
          <ul className="mt-1 space-y-2">
            {issuesQ.data.map((row) => (
              <li
                key={row.id}
                className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-xs text-zinc-300"
              >
                <span className="font-mono text-zinc-500">{row.status}</span>
                <p className="mt-0.5 whitespace-pre-wrap">{row.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Work orders
        </h3>
        {woQ.isPending && (
          <p className="text-zinc-500">Loading work orders…</p>
        )}
        {woQ.isError && (
          <p className="text-red-300">Could not load work orders.</p>
        )}
        {woQ.data && woQ.data.length === 0 && (
          <p className="text-zinc-500">No work orders linked to this section.</p>
        )}
        {woQ.data && woQ.data.length > 0 && (
          <ul className="mt-1 space-y-2">
            {woQ.data.map((wo) => (
              <li
                key={wo.id}
                className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5 text-xs text-zinc-300"
              >
                <span className="font-medium text-violet-300">{wo.title}</span>
                <p className="mt-0.5 text-zinc-500">{wo.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
