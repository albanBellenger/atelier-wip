import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Currency,
  Dot,
  PageTitle,
  Pill,
  Segmented,
  Table,
  THead,
  TRow,
  Avatar,
} from '../../components/admin/adminPrimitives'
import { DEPLOYMENT_WIDE_HARD_CAP_USD } from '../../data/adminConsoleMock'
import { STUDIO_BUDGET_OVERAGE_OPTIONS } from '../../constants/studioBudgetOverage'
import {
  getAdminConsoleOverview,
  getStudioMemberBudgets,
  patchStudioBudget as patchStudioBudgetApi,
  patchStudioMemberBudget,
  type StudioBudgetPatchBody,
} from '../../services/api'

function parseUsd(s: string | number | null | undefined): number {
  if (s == null || s === '') {
    return 0
  }
  const n = typeof s === 'number' ? s : Number(s)
  return Number.isFinite(n) ? n : 0
}

function initialsFrom(displayName: string, email: string): string {
  const parts = displayName.trim().split(/\s+/)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[1]?.[0]
    if (a && b) {
      return (a + b).toUpperCase()
    }
  }
  if (displayName.trim()) {
    return displayName.trim().slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function CapStepper({
  value,
  onChange,
  accent,
  pct,
  severity,
}: {
  value: number
  onChange: (v: number) => void
  accent: string
  pct: number
  severity: 'ok' | 'warn' | 'critical'
}): React.ReactElement {
  const inc = (): void => onChange(value + 50)
  const dec = (): void => onChange(Math.max(0, value - 50))
  const safePct = Math.min(Number.isFinite(pct) ? pct : 0, 1)
  const barColor =
    severity === 'critical'
      ? '#f43f5e'
      : severity === 'warn'
        ? '#f59e0b'
        : accent
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/60">
        <button
          type="button"
          onClick={dec}
          className="px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          −
        </button>
        <span className="px-2 font-mono text-[12px] tabular-nums text-zinc-100">${value}</span>
        <button
          type="button"
          onClick={inc}
          className="px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          +
        </button>
      </div>
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${safePct * 100}%`,
            background: barColor,
          }}
        />
      </div>
    </div>
  )
}

function AlertRow({
  tone,
  text,
  sub,
}: {
  tone: 'emerald' | 'amber' | 'rose'
  text: string
  sub: string
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <Dot tone={tone} />
        <div>
          <div className="text-[13px] text-zinc-200">{text}</div>
          <div className="text-[11px] text-zinc-500">{sub}</div>
        </div>
      </div>
      <Btn size="sm" type="button">
        Configure
      </Btn>
    </div>
  )
}

function StudioFilter({
  studioId,
  studioOptions,
  onChange,
}: {
  studioId: string | null
  studioOptions: { studio_id: string; name: string }[]
  onChange: (id: string) => void
}): ReactElement {
  return (
    <select
      className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[12px] text-zinc-200"
      value={studioId ?? ''}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    >
      {studioOptions.length === 0 ? (
        <option value="">No studios</option>
      ) : (
        studioOptions.map((s) => (
          <option key={s.studio_id} value={s.studio_id}>
            {s.name}
          </option>
        ))
      )}
    </select>
  )
}

export function BudgetsSection(): ReactElement {
  const qc = useQueryClient()
  const [scope, setScope] = useState<'studio' | 'builder'>('studio')
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null)

  const overviewQ = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminConsoleOverview(),
  })

  useEffect(() => {
    const studios = overviewQ.data?.studios
    if (!studios?.length) {
      return
    }
    setSelectedStudioId((prev) => prev ?? studios[0].studio_id)
  }, [overviewQ.data?.studios])

  const memberBudgetsQ = useQuery({
    queryKey: ['admin', 'member-budgets', selectedStudioId],
    queryFn: () => getStudioMemberBudgets(selectedStudioId as string),
    enabled: scope === 'builder' && selectedStudioId != null,
  })

  const studioBudgetMutation = useMutation({
    mutationFn: (vars: {
      studioId: string
      capUsd?: number
      overageAction?: string
    }) => {
      const body: StudioBudgetPatchBody = {}
      if (vars.capUsd !== undefined) {
        body.budget_cap_monthly_usd = vars.capUsd.toFixed(2)
      }
      if (vars.overageAction !== undefined) {
        body.budget_overage_action = vars.overageAction
      }
      return patchStudioBudgetApi(vars.studioId, body)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
    },
  })

  const patchMemberBudget = useMutation({
    mutationFn: ({
      studioId,
      userId,
      capUsd,
    }: {
      studioId: string
      userId: string
      capUsd: number
    }) =>
      patchStudioMemberBudget(studioId, userId, {
        budget_cap_monthly_usd: capUsd === 0 ? null : capUsd.toFixed(2),
      }),
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({
        queryKey: ['admin', 'member-budgets', vars.studioId],
      })
    },
  })

  return (
    <div className="space-y-6">
      <PageTitle
        title="Budgets"
        subtitle="Spend caps in USD. Studio caps roll up across all builders. Builder caps apply per member. Overage response is configured per studio (hard stop, allow with alerts, throttling, or read-only paths where implemented)."
        actions={
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              ['studio', 'By studio'],
              ['builder', 'By builder'],
            ]}
          />
        }
      />

      {scope === 'studio' ? (
        <Card title="Per-studio monthly cap">
          <Table>
            <THead
              cols={['Studio', 'Used', 'Cap', 'Remaining', 'Action on overage', '']}
              grid="grid-cols-[1.5fr_0.9fr_1.2fr_0.9fr_1.3fr_0.6fr]"
            />
            {overviewQ.isPending ? (
              <div className="px-5 py-6 text-[13px] text-zinc-500">Loading studios…</div>
            ) : overviewQ.isError ? (
              <div className="px-5 py-6 text-[13px] text-rose-300">
                Could not load studio budgets.
              </div>
            ) : overviewQ.data.studios.length === 0 ? (
              <div className="px-5 py-6 text-[13px] text-zinc-500">No studios yet.</div>
            ) : (
              overviewQ.data.studios.map((s) => {
                const spend = parseUsd(s.mtd_spend_usd)
                const capStr = s.budget_cap_monthly_usd
                const hasCap = capStr != null && capStr !== ''
                const capNum = hasCap ? parseUsd(capStr) : null
                const displayCap = capNum ?? 0
                const bs = s.budget_status
                const pctForBar =
                  bs.is_capped && bs.usage_pct != null
                    ? Math.min(1, bs.usage_pct / 100)
                    : 0
                const remaining =
                  bs.is_capped && bs.remaining_monthly_usd != null
                    ? parseUsd(bs.remaining_monthly_usd)
                    : null
                const saving =
                  studioBudgetMutation.isPending &&
                  studioBudgetMutation.variables?.studioId === s.studio_id

                const currentOverage =
                  s.budget_overage_action && s.budget_overage_action.length > 0
                    ? s.budget_overage_action
                    : 'pause_generations'

                return (
                  <TRow
                    key={s.studio_id}
                    grid="grid-cols-[1.5fr_0.9fr_1.2fr_0.9fr_1.3fr_0.6fr]"
                  >
                    <span className="truncate text-[13px] text-zinc-100">{s.name}</span>
                    <Currency value={spend} />
                    <CapStepper
                      value={displayCap}
                      onChange={(v) => {
                        studioBudgetMutation.mutate({ studioId: s.studio_id, capUsd: v })
                      }}
                      accent={ADMIN_CONSOLE_ACCENT}
                      pct={pctForBar}
                      severity={bs.severity}
                    />
                    <span
                      className={`font-mono text-[12px] tabular-nums ${
                        remaining != null && remaining < 0
                          ? 'text-rose-300'
                          : 'text-zinc-300'
                      }`}
                    >
                      {remaining != null ? `$${remaining.toFixed(2)}` : '—'}
                    </span>
                    <select
                      className="max-w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[11.5px] text-zinc-300"
                      aria-label={`Overage action for ${s.name}`}
                      value={currentOverage}
                      onChange={(e) => {
                        studioBudgetMutation.mutate({
                          studioId: s.studio_id,
                          overageAction: e.target.value,
                        })
                      }}
                    >
                      {STUDIO_BUDGET_OVERAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-right text-[11px] text-zinc-500">
                      {saving ? 'Saving…' : '—'}
                    </span>
                  </TRow>
                )
              })
            )}
          </Table>
          <div className="border-t border-zinc-800/60 px-5 py-3 text-[11px] text-zinc-500">
            Deployment-wide ceiling:{' '}
            <span className="font-mono text-zinc-300">
              ${DEPLOYMENT_WIDE_HARD_CAP_USD.toFixed(2)}
            </span>{' '}
            · Resets monthly · Currency USD
          </div>
        </Card>
      ) : (
        <Card
          title="Per-builder monthly cap"
          right={
            <StudioFilter
              studioId={selectedStudioId}
              studioOptions={overviewQ.data?.studios ?? []}
              onChange={setSelectedStudioId}
            />
          }
        >
          {!selectedStudioId || (overviewQ.data?.studios.length ?? 0) === 0 ? (
            <div className="px-5 py-6 text-[13px] text-zinc-500">
              Select a studio from the overview (create a studio first if empty).
            </div>
          ) : memberBudgetsQ.isPending ? (
            <div className="px-5 py-6 text-[13px] text-zinc-500">Loading members…</div>
          ) : memberBudgetsQ.isError ? (
            <div className="px-5 py-6 text-[13px] text-rose-300">
              Could not load member budgets.
            </div>
          ) : (
            <Table>
              <THead
                cols={['Builder', 'Role', 'Used', 'Cap', '']}
                grid="grid-cols-[1.6fr_0.7fr_0.9fr_1.2fr_0.6fr]"
              />
              {memberBudgetsQ.data?.map((row) => {
                const spend = parseUsd(row.mtd_spend_usd)
                const capStr = row.budget_cap_monthly_usd
                const hasCap = capStr != null && capStr !== ''
                const capNum = hasCap ? parseUsd(capStr) : null
                const displayCap = capNum ?? 0
                const bs = row.budget_status
                const pctForBar =
                  bs.is_capped && bs.usage_pct != null
                    ? Math.min(1, bs.usage_pct / 100)
                    : 0
                const saving =
                  patchMemberBudget.isPending &&
                  patchMemberBudget.variables?.userId === row.user_id

                const roleLabel = String(row.role)
                const pillTone =
                  roleLabel === 'studio_admin' || roleLabel.includes('admin')
                    ? 'violet'
                    : 'zinc'

                return (
                  <TRow
                    key={row.user_id}
                    grid="grid-cols-[1.6fr_0.7fr_0.9fr_1.2fr_0.6fr]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={initialsFrom(row.display_name, row.email)} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-zinc-100">
                          {row.display_name}
                        </div>
                        <div className="truncate text-[11px] text-zinc-500">{row.email}</div>
                      </div>
                    </div>
                    <Pill tone={pillTone}>{roleLabel}</Pill>
                    <Currency value={spend} />
                    <CapStepper
                      value={displayCap}
                      onChange={(v) => {
                        if (selectedStudioId) {
                          patchMemberBudget.mutate({
                            studioId: selectedStudioId,
                            userId: row.user_id,
                            capUsd: v,
                          })
                        }
                      }}
                      accent={ADMIN_CONSOLE_ACCENT}
                      pct={pctForBar}
                      severity={bs.severity}
                    />
                    <span className="text-right text-[11px] text-zinc-500">
                      {saving ? 'Saving…' : '—'}
                    </span>
                  </TRow>
                )
              })}
            </Table>
          )}
        </Card>
      )}

      <Card title="Alerts">
        <div className="space-y-2 p-4 text-[13px]">
          <AlertRow
            tone="emerald"
            text="Notify Owner at 75% of cap"
            sub="Per studio · Slack + email"
          />
          <AlertRow
            tone="amber"
            text="Notify tool admin at 90% of cap"
            sub="Per studio · Email"
          />
          <AlertRow tone="rose" text="Pause and alert at 100%" sub="Hard stop unless raised" />
        </div>
      </Card>
    </div>
  )
}
