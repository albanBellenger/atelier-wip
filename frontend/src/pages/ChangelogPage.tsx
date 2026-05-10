import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { CHANGELOG_MOCK_ENTRIES } from '../data/changelogMock'
import {
  HOME_STUDIO_ID_LS_KEY,
  resolveHomeStudioId,
} from '../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { logout as logoutApi, me } from '../services/api'
import { APP_VERSION } from '../version'

export function ChangelogPage(): ReactElement {
  const navigate = useNavigate()
  const hostedEnvLabel = hostedEnvironmentLabel(getHostedEnvironment())
  const { data: profile, isPending, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  const [studioId, setStudioId] = useState<string | null>(null)

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  useEffect(() => {
    if (!profile?.studios.length) {
      setStudioId(null)
      return
    }
    setStudioId((current) => {
      if (current && profile.studios.some((s) => s.studio_id === current)) {
        return current
      }
      return resolveHomeStudioId(profile) ?? profile.studios[0].studio_id
    })
  }, [profile])

  const handleStudioChange = useCallback((sid: string) => {
    localStorage.setItem(HOME_STUDIO_ID_LS_KEY, sid)
    setStudioId(sid)
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave app */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

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
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={studioId}
          onStudioChange={
            profile.studios.length > 1 ? handleStudioChange : undefined
          }
          onLogout={() => void handleLogout()}
          trailingCrumb={{ label: 'Changelog' }}
        />

        <div className="mx-auto mt-6 max-w-2xl">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
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

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
          <span>Atelier · Builder workspace</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
            <Link
              to="/changelog"
              className="text-zinc-500 hover:text-zinc-300 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              v{APP_VERSION}
            </Link>
            <span className="select-none font-sans text-zinc-700" aria-hidden>
              ·
            </span>
            <span
              className="rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500"
              title={`Hosted environment: ${hostedEnvLabel}`}
            >
              {hostedEnvLabel}
            </span>
          </span>
        </footer>
      </div>
    </div>
  )
}
