import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TokenUsageReportPanel } from '../components/tokenUsage/TokenUsageReportPanel'
import { me } from '../services/api'

export function AdminTokenUsagePage(): ReactElement {
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

  if (!profileQ.data.user.is_tool_admin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>Tool admin only.</p>
        <Link to="/" className="mt-4 inline-block text-violet-400">
          Home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link to="/admin/settings" className="text-sm text-violet-400 hover:underline">
          ← Tool admin settings
        </Link>
        <h1 className="text-2xl font-semibold">Token usage</h1>
        <TokenUsageReportPanel mode="admin" />
      </div>
    </div>
  )
}
