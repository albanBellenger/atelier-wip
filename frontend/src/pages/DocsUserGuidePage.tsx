import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'

import { BuilderHomeHeader } from '../components/home/BuilderHomeHeader'
import {
  HOME_STUDIO_ID_LS_KEY,
  resolveHomeStudioId,
} from '../lib/homeStudioPreference'
import {
  getHostedEnvironment,
  hostedEnvironmentLabel,
} from '../lib/hostedEnvironment'
import { APP_VERSION } from '../version'
import { logout as logoutApi, me } from '../services/api'

import userGuideSource from '../../docs/atelier-user-guide.md?raw'

export function DocsUserGuidePage(): ReactElement {
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
          trailingCrumb={{ label: 'Documentation' }}
        />

        <div className="mx-auto mt-6 max-w-2xl">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-zinc-100">
            Documentation
          </h1>
          <p className="mt-2 text-xs text-zinc-600">
            Mock source:{' '}
            <span className="font-mono">docs/atelier-user-guide.md</span>
          </p>

          <article className="mt-10 text-[15px] leading-relaxed text-zinc-300 [&_a]:text-violet-400 [&_a]:underline [&_code]:rounded [&_code]:bg-zinc-800/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_h1]:mb-4 [&_h1]:mt-10 [&_h1]:font-serif [&_h1]:text-2xl [&_h1]:font-medium [&_h1]:text-zinc-100 [&_h1]:first:mt-0 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_hr]:my-8 [&_hr]:border-zinc-800 [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13px] [&_strong]:text-zinc-200 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-800 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-zinc-800 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {userGuideSource}
            </ReactMarkdown>
          </article>
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
