import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { LlmUsageReportPanel } from '../components/tokenUsage/LlmUsageReportPanel'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { APP_VERSION } from '../version'
import { logout as logoutApi, me } from '../services/api'

export function LlmUsagePage(): ReactElement {
  const navigate = useNavigate()
  const hostedEnv = getHostedEnvironment()
  const hostedEnvLabel = hostedEnvironmentLabel(hostedEnv)

  const profileQ = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (profileQ.isError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileQ.isError, navigate])

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      /* still leave app */
    }
    void navigate('/auth', { replace: true })
  }, [navigate])

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  const profile = profileQ.data

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          onLogout={() => void handleLogout()}
        />

        <div className="mt-8 space-y-4">
          <h1 className="font-serif text-[28px] font-medium text-zinc-100">
            LLM usage
          </h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            Filter usage by studio, software, project, work order, call type, and
            dates.{' '}
            <Link to="/" className="text-violet-400 hover:underline">
              Back to home
            </Link>
          </p>
          <LlmUsageReportPanel profile={profile} />
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
