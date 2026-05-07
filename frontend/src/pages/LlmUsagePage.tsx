import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { LlmUsageReportPanel } from '../components/tokenUsage/LlmUsageReportPanel'
import { resolveLlmUsageHeaderStudioId } from '../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { APP_VERSION } from '../version'
import { logout as logoutApi, me } from '../services/api'

const LLM_USAGE_FILTERS_HELP =
  'Filter usage by studio, software, project, work order, call type, and dates.'

export function LlmUsagePage(): ReactElement {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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

  const headerStudioId = useMemo(() => {
    if (!profileQ.data) return null
    return resolveLlmUsageHeaderStudioId(profileQ.data, searchParams)
  }, [profileQ.data, searchParams])

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
          studioId={headerStudioId}
          onLogout={() => void handleLogout()}
        />

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[24px] font-medium leading-tight text-zinc-100 md:text-[26px]">
              LLM usage
            </h1>
            <button
              type="button"
              className="inline-flex shrink-0 cursor-help items-baseline justify-center rounded px-0.5 text-[13px] font-semibold leading-none text-zinc-500 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
              aria-label={LLM_USAGE_FILTERS_HELP}
              title={LLM_USAGE_FILTERS_HELP}
            >
              <span aria-hidden="true">?</span>
            </button>
          </div>
          <div className="mt-3">
            <LlmUsageReportPanel profile={profile} />
          </div>
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
