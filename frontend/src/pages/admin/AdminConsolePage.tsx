import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Hairline, Pill, StatLabel } from '../../components/admin/adminPrimitives'
import { InfoCircleHelpButton } from '../../components/ui/InfoCircleHelpButton'
import { Tooltip } from '../../components/ui/Tooltip'
import { adminConsolePath, type AdminConsoleSection } from '../../lib/adminConsoleNav'
import { getAdminConsoleOverview, me } from '../../services/api'

const ADMIN_CONSOLE_ACCENT = '#8b5cf6'

const NAV: { id: AdminConsoleSection; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'At-a-glance' },
  { id: 'studios', label: 'Studios', hint: 'Directory (read-only)' },
  { id: 'llm', label: 'LLM connectivity', hint: 'Providers & routing' },
  { id: 'budgets', label: 'Budgets', hint: 'Caps & overage' },
  { id: 'embeddings', label: 'Embeddings', hint: 'Indexes & policy' },
  { id: 'codebase', label: 'Codebase', hint: 'Git index by studio' },
  { id: 'users', label: 'Users', hint: 'Directory & roles' },
]

function AdminHeader(): ReactElement {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-zinc-800/80 px-8 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 13L8 3L14 13H2Z"
              stroke={ADMIN_CONSOLE_ACCENT}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              d="M5.5 13L8 8.5L10.5 13"
              stroke={ADMIN_CONSOLE_ACCENT}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
          <Link className="text-zinc-300 hover:text-zinc-100" to="/">
            Atelier
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-200">Admin console</span>
          <Pill tone="violet">Platform admin</Pill>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[12px]">
        <Link className="text-zinc-400 hover:text-zinc-200" to="/">
          ← Builder workspace
        </Link>
      </div>
    </header>
  )
}

function SideNav(): ReactElement {
  const overviewQ = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => getAdminConsoleOverview(),
    retry: false,
  })

  const live = overviewQ.isSuccess ? overviewQ.data : undefined

  const mtdTotal = live
    ? live.studios.reduce((s, r) => s + Number.parseFloat(r.mtd_spend_usd || '0'), 0)
    : 0
  const studioCount = live ? live.studios.length : 0
  const activeBuilders = live ? live.active_builders_count : 0

  const loading = overviewQ.isPending
  const studioLabel =
    studioCount === 1 ? '1 studio' : `${studioCount} studios`
  const builderLabel =
    activeBuilders === 1 ? '1 active builder' : `${activeBuilders} active builders`

  return (
    <nav className="sticky top-0 h-[calc(100vh-65px)] w-64 shrink-0 overflow-y-auto border-r border-zinc-800/80 px-4 py-6">
      <StatLabel>Admin</StatLabel>
      <ul className="mt-3 space-y-0.5">
        {NAV.map((n) => (
          <li key={n.id}>
            <NavLink
              to={adminConsolePath(n.id)}
              className={({ isActive }) =>
                `relative group flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition ${isActive ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span
                      className="absolute left-0 top-2 h-6 w-[2px] rounded-r-sm"
                      style={{ background: ADMIN_CONSOLE_ACCENT }}
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div
                      className={`text-[13px] ${isActive ? 'text-zinc-100' : 'text-zinc-300'}`}
                    >
                      {n.label}
                    </div>
                    <div className="text-[11px] text-zinc-500">{n.hint}</div>
                  </div>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <Hairline className="my-6" />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="flex items-center gap-1.5">
          <StatLabel>This month</StatLabel>
          <Tooltip
            className="shrink-0"
            side="bottom"
            disabled={loading}
            accessibleTrigger={false}
            content={
              <>
                Sum of listed studios (no cross-studio aggregate) · {studioLabel} · {builderLabel}
              </>
            }
          >
            <InfoCircleHelpButton
              aria-label="Month summary details"
              ringOffsetClass="focus-visible:ring-offset-zinc-900/40"
            />
          </Tooltip>
        </div>
        <div className="mt-2 font-mono text-[18px] tabular-nums text-zinc-100">
          {loading ? '…' : `$${mtdTotal.toFixed(2)}`}
        </div>
      </div>
    </nav>
  )
}

export function AdminConsolePage(): ReactElement {
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-zinc-400">
        Loading…
      </div>
    )
  }

  if (!profileQ.data.user.is_platform_admin) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] px-4 py-12 text-zinc-100">
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Platform administrator privileges are required for the admin console.
          </p>
          <Link to="/" className="mt-6 inline-block text-violet-400 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] font-sans text-zinc-100">
      <AdminHeader />
      <div className="flex">
        <SideNav />
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-10">
          <div className="mx-auto max-w-[1180px]">
            <Outlet />
            <footer className="mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/60 pt-6 text-[11px] text-zinc-600">
              <span>Atelier · Admin console</span>
              <Link
                className="font-mono text-zinc-400 hover:text-zinc-200"
                to={adminConsolePath('llm')}
              >
                Admin Console · LLM
              </Link>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
