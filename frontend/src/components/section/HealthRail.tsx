import type { ReactElement } from 'react'

import type { SectionHealth } from '../../services/api'

type HealthKey = 'drift' | 'gap' | 'tok' | 'src'

/** When API omits drawer_* (null/empty), mirror server-side copy from counts. */
function drawerBodyFromCounts(
  health: SectionHealth,
  openKey: HealthKey,
): string {
  const drift = health.drift_count ?? 0
  const gap = health.gap_count ?? 0
  const tokUsed = health.token_used ?? 0
  const tokBudget = health.token_budget ?? 0
  const cited = health.citations_resolved ?? 0
  const missing = health.citations_missing ?? 0
  if (openKey === 'drift') {
    return drift > 0
      ? `${drift} linked work order(s) flagged stale — review before publish.`
      : 'No stale linked work orders for this section.'
  }
  if (openKey === 'gap') {
    return gap > 0
      ? `${gap} open section-scoped issue(s) (gaps or follow-ups).`
      : 'No open single-section issues.'
  }
  if (openKey === 'tok') {
    return `${tokUsed.toLocaleString()} of ${tokBudget.toLocaleString()} tokens in the default RAG preview budget for this section.`
  }
  return `${cited} grounded claim(s); ${missing} claim(s) may lack explicit traceability.`
}

export function HealthRail(props: {
  health: SectionHealth | undefined
  openKey: HealthKey | null
  onToggle: (key: HealthKey) => void
  /** Jump the section copilot to Critique / Context / Sources from the drawer. */
  onOpenInCopilot?: (tab: 'critique' | 'context' | 'sources') => void
}): ReactElement {
  const { health, openKey, onToggle, onOpenInCopilot } = props
  const drift = health?.drift_count ?? 0
  const gap = health?.gap_count ?? 0
  const tokUsed = health?.token_used ?? 0
  const tokBudget = health?.token_budget ?? 0
  const cited = health?.citations_resolved ?? 0
  const missing = health?.citations_missing ?? 0

  const items: {
    key: HealthKey
    label: string
    value: string
    tone: 'amber' | 'emerald' | 'rose' | 'zinc'
  }[] = [
    {
      key: 'drift',
      label: 'Drift',
      value: String(drift),
      tone: drift > 0 ? 'amber' : 'emerald',
    },
    {
      key: 'gap',
      label: 'Gaps',
      value: String(gap),
      tone: gap > 0 ? 'rose' : 'emerald',
    },
    {
      key: 'tok',
      label: 'Tokens',
      value: `${tokUsed.toLocaleString()} / ${tokBudget.toLocaleString()}`,
      tone: 'zinc',
    },
    {
      key: 'src',
      label: 'Sources',
      value: `${cited} cited · ${missing} missing`,
      tone: missing > 0 ? 'amber' : 'emerald',
    },
  ]

  const dot = (tone: (typeof items)[0]['tone']): string => {
    const m: Record<typeof tone, string> = {
      zinc: 'bg-zinc-500',
      amber: 'bg-amber-400',
      emerald: 'bg-emerald-400',
      rose: 'bg-rose-400',
    }
    return m[tone]
  }

  const drawerBody = (): string | null => {
    if (!health || !openKey) {
      return null
    }
    const raw =
      openKey === 'drift'
        ? health.drawer_drift
        : openKey === 'gap'
          ? health.drawer_gap
          : openKey === 'tok'
            ? health.drawer_tokens
            : health.drawer_sources
    if (raw != null && raw.trim() !== '') {
      return raw
    }
    return drawerBodyFromCounts(health, openKey)
  }

  const body = drawerBody()

  const copilotTabForOpenKey = (): 'critique' | 'context' | 'sources' | null => {
    if (openKey == null) {
      return null
    }
    if (openKey === 'drift' || openKey === 'gap') {
      return 'critique'
    }
    if (openKey === 'tok') {
      return 'context'
    }
    return 'sources'
  }

  return (
    <div className="flex flex-col border-b border-zinc-800/80">
      <div className="flex items-stretch gap-px bg-zinc-800/40">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => {
              onToggle(it.key)
            }}
            className={`group flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left transition sm:px-4 ${
              openKey === it.key ? 'bg-zinc-900' : 'bg-[#0a0a0b] hover:bg-zinc-900/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${dot(it.tone)}`}
              />
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                {it.label}
              </span>
            </div>
            <span
              className={`font-mono text-[11px] tabular-nums sm:text-[12px] ${
                it.tone === 'rose'
                  ? 'text-rose-300'
                  : it.tone === 'amber'
                    ? 'text-amber-300'
                    : 'text-zinc-200'
              }`}
            >
              {it.value}
            </span>
          </button>
        ))}
      </div>
      {openKey != null ? (
        <div
          className="border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
          data-testid="health-rail-drawer"
        >
          {body != null && body.trim() !== '' ? (
            <p className="text-[12px] leading-relaxed text-zinc-400">{body}</p>
          ) : (
            <p className="text-[12px] text-zinc-500">No extra detail for this metric.</p>
          )}
          {onOpenInCopilot != null && copilotTabForOpenKey() != null ? (
            <div className="mt-3 border-t border-zinc-800/60 pt-2">
              <button
                type="button"
                data-testid="health-rail-open-copilot"
                className="text-[11px] text-violet-400 hover:underline"
                onClick={() => {
                  const t = copilotTabForOpenKey()
                  if (t != null) {
                    onOpenInCopilot(t)
                  }
                }}
              >
                {openKey === 'drift' || openKey === 'gap'
                  ? 'Open Critique tab'
                  : openKey === 'tok'
                    ? 'Open Context tab'
                    : 'Open Sources tab'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
