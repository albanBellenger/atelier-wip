import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import {
  categoryBreakdownFromRows,
  DISPLAY_TOKEN_BUDGET,
  last14LocalDayTotals,
  parseCostUsd,
  todayAndYesterdayFromRows,
} from '../../lib/tokenUsageHomeLayout'
import type { TokenUsageReport } from '../../services/api'

export type BuilderTokenStripProps = {
  report: TokenUsageReport | undefined
  isPending: boolean
  canSeeTokenUsage: boolean
  billedToStudioName: string | null
  /** Defaults to ``/llm-usage`` (e.g. pass ``?software_id=…`` for software-scoped report). */
  detailReportHref?: string
  /** Outer section vertical padding; default matches the home dashboard card. */
  sectionPaddingClass?: 'p-5' | 'p-6'
  /** Card title (default: Your LLM usage). */
  heading?: string
}

function budgetToneClass(pct: number): string {
  if (pct < 60) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
  if (pct < 80) return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
}

function budgetDotClass(pct: number): string {
  if (pct < 60) return 'bg-emerald-400'
  if (pct < 80) return 'bg-amber-400'
  return 'bg-rose-400'
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function BuilderTokenStrip({
  report,
  isPending,
  canSeeTokenUsage,
  billedToStudioName,
  detailReportHref = '/llm-usage',
  sectionPaddingClass = 'p-6',
  heading = 'Your LLM usage',
}: BuilderTokenStripProps): ReactElement {
  const shell = `rounded-2xl border border-zinc-800 bg-zinc-900/40 ${sectionPaddingClass}`
  if (!canSeeTokenUsage) {
    return (
      <section className={shell}>
        <h3 className="text-[13px] font-medium text-zinc-200">{heading}</h3>
        <p className="mt-2 text-[12px] text-zinc-500">
          Token usage is available once you belong to a studio or are a tool
          administrator.
        </p>
      </section>
    )
  }

  const monthLabel = new Date().toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const billingLine =
    billedToStudioName && billedToStudioName.length > 0
      ? `${monthLabel} · billed to ${billedToStudioName}`
      : monthLabel

  if (isPending || !report) {
    return (
      <section className={shell}>
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-medium text-zinc-200">{heading}</h3>
          <Link
            to={detailReportHref}
            className="text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Detailed report →
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">{billingLine}</p>
        <p className="mt-5 text-sm text-zinc-500">Loading…</p>
      </section>
    )
  }

  const tin = report.totals.input_tokens ?? 0
  const tout = report.totals.output_tokens ?? 0
  const total = tin + tout
  const cost = parseCostUsd(report.totals.estimated_cost_usd)
  const pctToken = Math.min(
    100,
    Math.round((total / DISPLAY_TOKEN_BUDGET) * 100),
  )

  const bb = report.builder_budget
  const useUsdBudget = bb != null
  const spentUsd = useUsdBudget ? parseCostUsd(bb.spent_monthly_usd) : 0
  const capUsdParsed =
    useUsdBudget && bb.cap_monthly_usd != null && bb.cap_monthly_usd !== ''
      ? parseCostUsd(bb.cap_monthly_usd)
      : null
  const hasUsdCap =
    capUsdParsed !== null && capUsdParsed > 0 && Number.isFinite(capUsdParsed)
  const capUsd = hasUsdCap ? capUsdParsed : null
  const pctUsd =
    hasUsdCap && capUsd != null && capUsd > 0
      ? Math.min(100, Math.round((spentUsd / capUsd) * 100))
      : null
  const barPct =
    useUsdBudget && hasUsdCap && pctUsd !== null
      ? pctUsd
      : useUsdBudget
        ? 0
        : pctToken

  const breakdown = categoryBreakdownFromRows(report.rows)
  const maxCat = Math.max(1, ...breakdown.map((b) => b.tokens))
  const spark = last14LocalDayTotals(report.rows)
  const sparkMax = Math.max(1, ...spark)
  const { today: todayTok, yesterday: yestTok } = todayAndYesterdayFromRows(
    report.rows,
  )

  return (
    <section className={shell}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-zinc-200">{heading}</h3>
          <p className="mt-1 text-[11px] text-zinc-500">{billingLine}</p>
        </div>
        <Link
          to={detailReportHref}
          className="shrink-0 text-[11px] text-zinc-400 hover:text-zinc-200"
        >
          Detailed report →
        </Link>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-2">
        {useUsdBudget ? (
          hasUsdCap && capUsd != null ? (
            <>
              <span className="font-mono text-[28px] leading-none tabular-nums text-zinc-100">
                {formatUsd(spentUsd)}
              </span>
              <span className="text-[12px] text-zinc-500">
                / {formatUsd(capUsd)} monthly cap
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-[28px] leading-none tabular-nums text-zinc-100">
                {formatUsd(spentUsd)}
              </span>
              <span className="text-[12px] text-zinc-500">
                this month (estimated)
              </span>
            </>
          )
        ) : (
          <>
            <span className="font-mono text-[28px] leading-none tabular-nums text-zinc-100">
              {total.toLocaleString()}
            </span>
            <span className="text-[12px] text-zinc-500">
              / {DISPLAY_TOKEN_BUDGET.toLocaleString()} tokens
            </span>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {useUsdBudget ? (
          <>
            <span className="text-[13px] text-zinc-400">
              {total.toLocaleString()} tokens in usage log
            </span>
            {hasUsdCap && pctUsd !== null ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${budgetToneClass(pctUsd)}`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${budgetDotClass(pctUsd)}`}
                  aria-hidden
                />
                {pctUsd}% of cap
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-800/40 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
                No personal cap
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-[13px] text-zinc-400">
              ≈ ${cost.toFixed(2)} this month
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${budgetToneClass(pctToken)}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${budgetDotClass(pctToken)}`}
                aria-hidden
              />
              {pctToken}% of budget
            </span>
          </>
        )}
      </div>

      {useUsdBudget && !hasUsdCap ? null : (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
          <div
            className="h-full rounded-full bg-violet-600"
            style={{ width: `${barPct}%` }}
          />
        </div>
      )}

      <div className="mt-6 space-y-2.5">
        {breakdown.map((row) => (
          <div key={row.key} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-[12px] text-zinc-400">
              {row.label}
            </span>
            <div className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800/60">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-violet-600"
                style={{ width: `${(row.tokens / maxCat) * 100}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">
              {row.tokens.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className="my-5 h-px w-full bg-zinc-800/80" />

      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
            Last 14 days
          </div>
          <div className="mt-2 flex h-10 items-end gap-1">
            {spark.map((v, i) => {
              const hPx = Math.max(2, Math.round((v / sparkMax) * 40))
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-sm ${
                    i === spark.length - 1 ? 'bg-violet-600' : 'bg-zinc-600'
                  }`}
                  style={{ height: `${hPx}px` }}
                  title={`${v.toLocaleString()} tokens`}
                />
              )
            })}
          </div>
        </div>
        <div className="flex gap-8 text-right">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              Today
            </div>
            <div className="mt-1 font-mono text-[18px] tabular-nums text-zinc-100">
              {todayTok.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              Yesterday
            </div>
            <div className="mt-1 font-mono text-[18px] tabular-nums text-zinc-500">
              {yestTok.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">
        {useUsdBudget ? (
          hasUsdCap ? (
            <>
              Bar and percent compare estimated LLM spend for the current
              calendar month in the selected studio to your personal monthly USD
              cap (same check as before each LLM call). Token counts and
              category bars use the detailed report rows (up to 5,000).
            </>
          ) : (
            <>
              No personal monthly USD cap is set for this studio. Token counts
              and category bars use the detailed report rows (up to 5,000), not
              calendar-scoped.
            </>
          )
        ) : (
          <>
            Budget bar uses a 2M token display scale. Full totals come from the
            server; category bars use proportions of your recent logged calls (up
            to 5,000 rows).
          </>
        )}
      </p>
    </section>
  )
}
