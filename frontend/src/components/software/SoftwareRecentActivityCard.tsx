import type { ReactElement } from 'react'

import type { SoftwareActivityItem } from '../../services/api'
import { formatPersonShortLabel } from '../../lib/formatPersonShortLabel'
import { formatRelativeTimeUtc } from '../../lib/formatRelativeTime'

export type SoftwareRecentActivityCardProps = {
  /** When false, activity is not loaded for this user (e.g. viewer). */
  enabled: boolean
  isPending: boolean
  isError: boolean
  items: SoftwareActivityItem[]
  /** Defaults to ``Recent activity``. */
  title?: string
  /** Shown under the title when provided (e.g. scope hint). */
  subtitle?: string
  /** Overrides the default empty copy when ``items`` is empty. */
  emptyMessage?: string
}

function verbPhrase(verb: string): string {
  switch (verb) {
    case 'project_created':
      return 'created'
    case 'project_archived':
      return 'archived'
    case 'project_unarchived':
      return 'restored'
    case 'published':
      return 'published to GitLab'
    default:
      return verb.replace(/_/g, ' ')
  }
}

function objectMono(summary: string, verb: string): string {
  const patterns: [string, RegExp][] = [
    ['project_created', /^Created project (.+)$/i],
    ['project_archived', /^Archived project (.+)$/i],
    ['project_unarchived', /^Restored project (.+)$/i],
    ['published', /^Published (.+) to GitLab$/i],
  ]
  for (const [v, re] of patterns) {
    if (verb === v) {
      const m = summary.match(re)
      if (m?.[1]) return m[1].trim()
    }
  }
  return summary
}

function activityDotClass(verb: string): string {
  const v = verb.toLowerCase()
  if (v.includes('drift') || v.includes('flag')) {
    return 'bg-yellow-500'
  }
  return 'bg-purple-400'
}

export function SoftwareRecentActivityCard({
  enabled,
  isPending,
  isError,
  items,
  title = 'Recent activity',
  subtitle,
  emptyMessage,
}: SoftwareRecentActivityCardProps): ReactElement {
  const emptyCopy = emptyMessage ?? 'No activity yet.'
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 text-[12px] text-zinc-500">{subtitle}</p>
      ) : null}
      <div className="mt-3 border-b border-zinc-800/90" aria-hidden />

      <div className="mt-3">
        {!enabled ? (
          <p className="text-[13px] text-zinc-500">
            Activity is available to members who can manage projects in this studio.
          </p>
        ) : isPending ? (
          <p className="text-[13px] text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="text-[13px] text-zinc-500">Not available.</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-zinc-500">{emptyCopy}</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {items.map((ev) => {
              const actor = formatPersonShortLabel(ev.actor_display)
              const phrase = verbPhrase(ev.verb)
              const mono = objectMono(ev.summary, ev.verb)
              const when = formatRelativeTimeUtc(ev.created_at)
              return (
                <li key={ev.id} className="flex gap-3 py-3.5 first:pt-0">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 self-start rounded-full ${activityDotClass(ev.verb)}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-medium text-zinc-100">{actor}</span>{' '}
                      <span className="text-zinc-500">{phrase}</span>{' '}
                      <span className="font-mono text-[13px] text-zinc-100">
                        {mono}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {when ?? '—'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
