import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { ReturnNavLink } from '../components/nav/ReturnNavLink'
import { Tooltip } from '../components/ui/Tooltip'
import { InfoCircleHelpButton } from '../components/ui/InfoCircleHelpButton'
import { LlmUsageReportPanel } from '../components/tokenUsage/LlmUsageReportPanel'
import { resolveLlmUsageHeaderStudioId } from '../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import {
  readLlmUsageFilterIdsFromSearch,
  resolveExplicitLlmUsageReturn,
  resolveLlmUsageReturnNav,
} from '../lib/llmUsageReturnTarget'
import { APP_VERSION } from '../version'
import {
  listSoftware,
  listStudioProjects,
  logout as logoutApi,
  me,
} from '../services/api'

const LLM_USAGE_FILTERS_HELP =
  'Filter usage by studio, software, project, work order, LLM source, and dates.'

export function LlmUsagePage(): ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
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

  const profile = profileQ.data ?? null

  const headerStudioId = useMemo(() => {
    if (!profile) return null
    return resolveLlmUsageHeaderStudioId(profile, searchParams)
  }, [profile, searchParams])

  const { studioIds, softwareIds, projectIds } = useMemo(
    () => readLlmUsageFilterIdsFromSearch(searchParams),
    [searchParams],
  )

  const explicitReturn = useMemo(
    () =>
      profile
        ? resolveExplicitLlmUsageReturn(location.state, searchParams)
        : null,
    [profile, location.state, searchParams],
  )

  const studioForQueries = useMemo(() => {
    if (studioIds.length === 1) return studioIds[0]
    return headerStudioId ?? ''
  }, [studioIds, headerStudioId])

  const needProjects =
    Boolean(profile) &&
    !explicitReturn &&
    projectIds.length === 1 &&
    Boolean(studioForQueries)
  const needSoftware =
    Boolean(profile) &&
    !explicitReturn &&
    projectIds.length === 0 &&
    softwareIds.length === 1 &&
    Boolean(studioForQueries)

  const studioProjectsQ = useQuery({
    queryKey: ['studio', studioForQueries, 'projects', 'llm-return'],
    queryFn: () => listStudioProjects(studioForQueries),
    enabled: needProjects,
    retry: false,
  })

  const softwareListQ = useQuery({
    queryKey: ['studios', studioForQueries, 'software', 'llm-return'],
    queryFn: () => listSoftware(studioForQueries),
    enabled: needSoftware,
    retry: false,
  })

  const returnNav = useMemo(() => {
    if (!profile) return null
    return resolveLlmUsageReturnNav({
      profile,
      searchParams,
      locationState: location.state,
      headerStudioId,
      studioProjects: studioProjectsQ.data,
      softwareList: softwareListQ.data,
    })
  }, [
    profile,
    searchParams,
    location.state,
    headerStudioId,
    studioProjectsQ.data,
    softwareListQ.data,
  ])

  if (profileQ.isPending || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] px-8 pb-16 pt-8 font-sans text-zinc-100">
      <div className="mx-auto max-w-[1240px]">
        <BuilderHomeHeader
          profile={profile}
          studioId={headerStudioId}
          onLogout={() => void handleLogout()}
        />

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-serif text-[24px] font-medium leading-tight text-zinc-100 md:text-[26px]">
              LLM usage
            </h1>
            <Tooltip
              className="shrink-0"
              side="top"
              content={LLM_USAGE_FILTERS_HELP}
              accessibleTrigger={false}
            >
              <InfoCircleHelpButton aria-label={LLM_USAGE_FILTERS_HELP} />
            </Tooltip>
            <ReturnNavLink target={returnNav} className="sm:ml-auto" />
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
            <Tooltip
              className="inline-flex shrink-0"
              side="bottom"
              content={`Hosted environment: ${hostedEnvLabel}`}
              accessibleTrigger={false}
            >
              <span className="cursor-default rounded border border-zinc-700/70 px-1.5 py-px text-[10px] font-sans font-normal uppercase tracking-wider text-zinc-500">
                {hostedEnvLabel}
              </span>
            </Tooltip>
          </span>
        </footer>
      </div>
    </div>
  )
}
