import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import { EmptyState } from '../components/ui/EmptyState'
import {
  HOME_STUDIO_ID_LS_KEY,
  resolveHomeStudioId,
} from '../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { listStudios, logout as logoutApi, me } from '../services/api'
import type { MeResponse, StudioListItem } from '../services/api'
import { APP_VERSION } from '../version'

export function StudiosListPage(): ReactElement {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [studioId, setStudioId] = useState<string | null>(null)

  const { data: profile, isPending: profilePending, isError: profileError } =
    useQuery<MeResponse>({
      queryKey: ['auth', 'me'],
      queryFn: () => me(),
      retry: false,
    })

  const { data: studios, isPending: studiosPending, isError: studiosError } =
    useQuery<StudioListItem[]>({
      queryKey: ['studios'],
      queryFn: () => listStudios(),
      retry: false,
      enabled: Boolean(profile),
    })

  useEffect(() => {
    if (profileError || studiosError) {
      void navigate('/auth', { replace: true })
    }
  }, [profileError, studiosError, navigate])

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

  const hostedEnvLabel = hostedEnvironmentLabel(getHostedEnvironment())

  const filteredStudios = useMemo(() => {
    if (!studios) return []
    const q = search.trim().toLowerCase()
    if (!q) return studios
    return studios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    )
  }, [studios, search])

  if (profileError || studiosError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (profilePending || !profile || studiosPending || studios === undefined) {
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
          studioId={studioId}
          onStudioChange={
            profile.studios.length > 1 ? handleStudioChange : undefined
          }
          onLogout={() => void handleLogout()}
          trailingCrumb={{ label: 'Studios' }}
        />

        <div className="mt-6">
          <label className="block text-sm font-medium text-zinc-400" htmlFor="studios-search">
            Search studios
            <input
              id="studios-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or description…"
              className="mt-2 w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-600"
            />
          </label>
        </div>

        {studios.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="No studios yet"
              description={
                profile.user.is_platform_admin
                  ? 'Create a studio from the Admin console (Studios).'
                  : 'Ask a platform administrator to create a studio or invite you to one.'
              }
            />
            {profile.user.is_platform_admin ? (
              <p className="mt-4 text-sm text-zinc-500">
                <Link
                  to="/admin/console/studios"
                  className="font-medium text-violet-400 hover:underline"
                >
                  Open Admin console — Studios
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {studios.length > 0 && filteredStudios.length === 0 ? (
          <p className="mt-10 text-sm text-zinc-500" role="status">
            No studios match your search.
          </p>
        ) : null}

        {studios.length > 0 && filteredStudios.length > 0 ? (
          <ul className="mt-10 grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStudios.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/studios/${s.id}`}
                  className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-600 hover:bg-zinc-900/70"
                >
                  <span className="font-serif text-lg font-medium text-zinc-100">
                    {s.name}
                  </span>
                  {s.description ? (
                    <span className="mt-2 line-clamp-2 text-sm text-zinc-500">
                      {s.description}
                    </span>
                  ) : null}
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-4 text-center text-xs text-zinc-500">
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-zinc-600">
                        Software
                      </dt>
                      <dd className="mt-1 text-base font-semibold text-zinc-200">
                        {s.software_count}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-zinc-600">
                        Projects
                      </dt>
                      <dd className="mt-1 text-base font-semibold text-zinc-200">
                        {s.project_count}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-zinc-600">
                        Members
                      </dt>
                      <dd className="mt-1 text-base font-semibold text-zinc-200">
                        {s.member_count}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

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
