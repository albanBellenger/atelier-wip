import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TokenUsageReportPanel } from '../components/tokenUsage/TokenUsageReportPanel'
import { useStudioAccess } from '../hooks/useStudioAccess'
import { me } from '../services/api'

export function StudioTokenUsagePage(): ReactElement {
  const navigate = useNavigate()
  const { studioId } = useParams<{ studioId: string }>()
  const sid = studioId ?? ''

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

  const access = useStudioAccess(profileQ.data, sid)

  if (!sid) {
    void navigate('/studios', { replace: true })
    return <div className="min-h-screen bg-zinc-950" />
  }

  if (profileQ.isPending || !profileQ.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!access.isStudioAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-zinc-100">
        <p>Studio admin only.</p>
        <Link to={`/studios/${sid}`} className="mt-4 inline-block text-violet-400">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          to={`/studios/${sid}/settings`}
          className="text-sm text-violet-400 hover:underline"
        >
          ← Studio settings
        </Link>
        <h1 className="text-2xl font-semibold">Studio token usage</h1>
        <TokenUsageReportPanel mode="studio" studioId={sid} />
      </div>
    </div>
  )
}
