import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { userCanSeeMeTokenUsage } from '../components/home/UserMenu'
import { me } from '../services/api'

export function NotificationSettingsPage(): ReactElement {
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

  const canToken = userCanSeeMeTokenUsage(profile)
  return (
    <div className="min-h-screen bg-[#0a0a0b] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <Link
          to="/"
          className="text-sm font-medium text-violet-400 hover:underline"
        >
          ← Back to home
        </Link>
        <h1 className="mt-6 font-serif text-3xl font-medium tracking-tight text-zinc-100">
          Notification settings
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          In-app notifications appear in the bell panel on the home screen. Email
          and digest preferences are not configured yet.
        </p>
        {canToken ? (
          <p className="mt-6 text-sm text-zinc-500">
            <Link
              to="/llm-usage"
              className="font-medium text-violet-400 hover:underline"
            >
              Token usage
            </Link>{' '}
            — LLM usage for your account.
          </p>
        ) : null}
      </div>
    </div>
  )
}
