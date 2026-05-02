import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { CHANGELOG_MOCK_ENTRIES } from '../data/changelogMock'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { me } from '../services/api'
import { APP_VERSION } from '../version'

export function ChangelogPage(): ReactElement {
  const navigate = useNavigate()
  const { data: profile, isPending, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  const env = getHostedEnvironment()
  const envLabel = hostedEnvironmentLabel(env)

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="text-sm font-medium text-violet-400 hover:underline"
        >
          ← Back to home
        </Link>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-zinc-100">
            Changelog
          </h1>
          <span className="font-mono text-sm text-zinc-500">v{APP_VERSION}</span>
          <span
            className="rounded border border-zinc-700/80 px-2 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wider text-zinc-500"
            title={`Hosted environment: ${envLabel}`}
          >
            {envLabel}
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          Release notes for the builder workspace. Entries below are placeholders until
          they are maintained from the product pipeline.
        </p>

        <ol className="mt-10 space-y-10">
          {CHANGELOG_MOCK_ENTRIES.map((entry) => (
            <li key={entry.version}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-800/80 pb-2">
                <span className="font-mono text-sm font-semibold text-zinc-200">
                  v{entry.version}
                </span>
                <time
                  className="text-xs text-zinc-500"
                  dateTime={entry.date}
                >
                  {entry.date}
                </time>
              </div>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
