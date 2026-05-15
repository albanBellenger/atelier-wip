import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  KpiTile,
  MoneyBar,
  PageTitle,
  Table,
  THead,
  TRow,
} from '../../components/admin/adminPrimitives'
import { adminConsolePath, type AdminConsoleSection } from '../../lib/adminConsoleNav'
import { getAdminConsoleOverview } from '../../services/api'

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

  const mtdTotal = live
    ? live.studios.reduce((s, r) => s + Number.parseFloat(r.mtd_spend_usd || '0'), 0)
    : 0
  const studioCount = live ? live.studios.length : 0
  const softwareTotal = live
    ? live.studios.reduce((acc, r) => acc + r.software_count, 0)
    : 0
  const budgetSum = live
    ? live.studios.reduce((acc, r) => acc + Number.parseFloat(r.budget_cap_monthly_usd || '0'), 0)
    : 0

  const studioWord = studioCount === 1 ? 'studio' : 'studios'

  const tiles = [
    {
      label: 'Software',
      value: softwareTotal,
      sub: `of ${studioCount} ${studioWord}`,
    },
    {
      label: 'Active builders',
      value: live ? live.active_builders_count : 0,
    },
    {
      label: 'Spend MTD',
      value: `$${mtdTotal.toFixed(2)}`,
      sub:
        budgetSum > 0
          ? `sum across listed studios · caps $${budgetSum.toFixed(2)}`
          : live
            ? 'sum across listed studios · no studio caps set'
            : 'sum across listed studios · no overview data',
    },
    {
      label: 'Embedding indexes',
      value: live ? live.embedding_collection_count : 0,
      sub: live ? 'chunk rows indexed' : '—',
    },
  ]

  return (
    <div className="space-y-6">
      <PageTitle
        title="Overview"
        subtitle="At-a-glance health: studios, spend, and embedding coverage."
      />

      {overviewQ.error != null ? (
        <p className="text-[12px] text-amber-300/90">
          Could not load overview metrics. KPIs show zeros until a successful load.{' '}
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
          {overviewQ.isPending ? (
            <p className="px-5 py-6 text-[13px] text-zinc-500">Loading overview…</p>
          ) : live && live.studios.length > 0 ? (
            live.studios.map((s) => {
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
          ) : live && live.studios.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-zinc-500">No studios in this overview.</p>
          ) : (
            <p className="px-5 py-6 text-[13px] text-zinc-500">
              No overview data. Unable to load the studio list — open Studios to browse tenants.
            </p>
          )}
        </Table>
      </Card>

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
