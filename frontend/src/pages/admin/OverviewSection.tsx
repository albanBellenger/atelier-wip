import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
  KpiTile,
  MoneyBar,
  PageTitle,
  Table,
  THead,
  TRow,
} from '../../components/admin/adminPrimitives'
import { AUDIT_LOG, BUILDERS, EMBED_COLLECTIONS, STUDIOS } from '../../data/adminConsoleMock'
import { adminConsolePath, type AdminConsoleSection } from '../../lib/adminConsoleNav'
import {
  type DeploymentActivityRow,
  getAdminConsoleOverview,
} from '../../services/api'

export function OverviewSection(): ReactElement {
  const navigate = useNavigate()
  const go = (s: AdminConsoleSection): void => {
    navigate(adminConsolePath(s))
  }

  const overviewQ = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminConsoleOverview(),
    retry: false,
  })

  const live = overviewQ.isSuccess ? overviewQ.data : undefined

  const totalSpendMock = STUDIOS.reduce((s, x) => s + x.monthSpend, 0)
  const totalBudgetMock = STUDIOS.reduce((s, x) => s + x.budget, 0)
  const activeUsersMock = BUILDERS.filter((b) => b.status === 'active').length

  const mtdTotal = live
    ? live.studios.reduce((s, r) => s + Number.parseFloat(r.mtd_spend_usd || '0'), 0)
    : totalSpendMock
  const studioCount = live ? live.studios.length : STUDIOS.length
  const softwareTotal = live
    ? live.studios.reduce((acc, r) => acc + r.software_count, 0)
    : STUDIOS.reduce((acc, s) => acc + s.software, 0)
  const budgetSum = live
    ? live.studios.reduce((acc, r) => acc + Number.parseFloat(r.budget_cap_monthly_usd || '0'), 0)
    : totalBudgetMock

  const studioWord = studioCount === 1 ? 'studio' : 'studios'

  const tiles = [
    {
      label: 'Software',
      value: softwareTotal,
      sub: `of ${studioCount} ${studioWord}`,
    },
    {
      label: 'Active builders',
      value: live ? live.active_builders_count : activeUsersMock,
    },
    {
      label: 'Spend MTD',
      value: `$${mtdTotal.toFixed(2)}`,
      sub:
        budgetSum > 0
          ? `sum across listed studios · caps $${budgetSum.toFixed(2)}`
          : `sum across listed studios · $${totalBudgetMock} caps (demo)`,
    },
    {
      label: 'Embedding indexes',
      value: live ? live.embedding_collection_count : EMBED_COLLECTIONS.length,
      sub: live
        ? 'chunk rows indexed'
        : `${EMBED_COLLECTIONS.filter((e) => e.status === 'stale').length} stale · ${EMBED_COLLECTIONS.filter((e) => e.status === 'indexing').length} indexing`,
    },
  ]

  const activityRows =
    live && live.recent_activity.length > 0 ? live.recent_activity : null

  return (
    <div className="space-y-6">
      <PageTitle
        title="Overview"
        subtitle="At-a-glance health: studios, spend, embedding coverage, and recent events."
      />

      {overviewQ.isError ? (
        <p className="text-[12px] text-amber-300/90">
          Live metrics unavailable — showing demo fallbacks.{' '}
          <span className="font-mono text-zinc-500">
            {(overviewQ.error as Error)?.message ?? 'request failed'}
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <KpiTile key={t.label} label={t.label} value={t.value} sub={t.sub} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card
          title="Studios at a glance"
          right={
            <Btn type="button" onClick={() => go('studios')}>
              Manage →
            </Btn>
          }
        >
          <Table>
            <THead
              cols={['Studio', 'Software', 'Members', 'Spend / Budget', '']}
              grid="grid-cols-[1.8fr_0.7fr_0.7fr_1.5fr_0.4fr]"
            />
            {live
              ? live.studios.map((s) => {
                  const used = Number.parseFloat(s.mtd_spend_usd || '0')
                  const capNum = s.budget_cap_monthly_usd
                    ? Number.parseFloat(s.budget_cap_monthly_usd)
                    : Math.max(used, 1)
                  return (
                    <TRow key={s.studio_id} grid="grid-cols-[1.8fr_0.7fr_0.7fr_1.5fr_0.4fr]">
                      <span className="truncate text-[13px] text-zinc-100">{s.name}</span>
                      <span className="font-mono text-[12px] tabular-nums text-zinc-300">
                        {s.software_count}
                      </span>
                      <span className="font-mono text-[12px] tabular-nums text-zinc-300">
                        {s.member_count}
                      </span>
                      <MoneyBar used={used} budget={capNum} accent={ADMIN_CONSOLE_ACCENT} />
                      <Btn size="sm" type="button" onClick={() => go('studios')}>
                        Open
                      </Btn>
                    </TRow>
                  )
                })
              : STUDIOS.map((s) => (
                  <TRow key={s.id} grid="grid-cols-[1.8fr_0.7fr_0.7fr_1.5fr_0.4fr]">
                    <span className="truncate text-[13px] text-zinc-100">{s.name}</span>
                    <span className="font-mono text-[12px] tabular-nums text-zinc-300">
                      {s.software}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-zinc-300">{s.members}</span>
                    <MoneyBar used={s.monthSpend} budget={s.budget} accent={ADMIN_CONSOLE_ACCENT} />
                    <Btn size="sm" type="button" onClick={() => go('studios')}>
                      Open
                    </Btn>
                  </TRow>
                ))}
          </Table>
        </Card>

        <Card title="Recent activity">
          <ul className="px-1 py-1">
            {activityRows
              ? activityRows.map((a: DeploymentActivityRow, i: number) => (
                  <li
                    key={a.id}
                    className={`flex items-start gap-3 px-4 py-3 text-[12px] ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                  >
                    <Dot tone={a.actor_user_id ? 'violet' : 'amber'} />
                    <div className="min-w-0 flex-1">
                      <span className="text-zinc-300">{a.action}</span>
                      {a.summary ? (
                        <>
                          <span className="text-zinc-500"> · </span>
                          <span className="text-zinc-200">{a.summary}</span>
                        </>
                      ) : null}
                      <div className="text-[11px] text-zinc-500">{a.created_at}</div>
                    </div>
                  </li>
                ))
              : AUDIT_LOG.map((a, i) => (
                  <li
                    key={`${a.target}-${i}`}
                    className={`flex items-start gap-3 px-4 py-3 text-[12px] ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                  >
                    <Dot tone={a.who === 'System' ? 'amber' : 'violet'} />
                    <div className="min-w-0 flex-1">
                      <span className="text-zinc-300">{a.who}</span>
                      <span className="text-zinc-500"> {a.what} </span>
                      <span className="text-zinc-200">{a.target}</span>
                      <div className="text-[11px] text-zinc-500">{a.when}</div>
                    </div>
                  </li>
                ))}
          </ul>
        </Card>
      </div>

      <Card title="Quick actions">
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['View studios', 'studios'],
              ['Connect a provider', 'llm'],
              ['Reindex embeddings', 'embeddings'],
            ] as const
          ).map(([label, target]) => (
            <button
              key={label}
              type="button"
              onClick={() => go(target)}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-left text-[13px] text-zinc-200 hover:bg-zinc-800/60"
            >
              <span>{label}</span>
              <span className="text-zinc-500">→</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
