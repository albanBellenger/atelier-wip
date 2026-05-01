import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { BuilderHomeDashboard } from '../components/home/BuilderHomeDashboard'
import { logout as logoutApi, me } from '../services/api'
import type { MeResponse } from '../services/api'

export function HomePage(): ReactElement {
  const navigate = useNavigate()

  const { data: profile, isPending, isError } = useQuery<MeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: () => me(),
    retry: false,
  })

  useEffect(() => {
    if (isError) {
      void navigate('/auth', { replace: true })
    }
  }, [isError, navigate])

  async function logout(): Promise<void> {
    try {
      await logoutApi()
    } catch {
      /* still leave app */
    }
    void navigate('/auth', { replace: true })
  }

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

  return <BuilderHomeDashboard profile={profile} onLogout={() => void logout()} />
}
