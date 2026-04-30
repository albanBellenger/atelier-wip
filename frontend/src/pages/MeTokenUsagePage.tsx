import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TokenUsageReportPanel } from '../components/tokenUsage/TokenUsageReportPanel'
import { me } from '../services/api'

export function MeTokenUsagePage(): ReactElement {
  const navigate = useNavigate()

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

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link to="/" className="text-sm text-violet-400 hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">My token usage</h1>
        <TokenUsageReportPanel mode="me" />
      </div>
    </div>
  )
}
