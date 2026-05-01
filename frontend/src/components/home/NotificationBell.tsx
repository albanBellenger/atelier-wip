import { useState, type ReactElement } from 'react'

import { NotificationsPanel } from './NotificationsPanel'
import { useQuery } from '@tanstack/react-query'

import { listMeNotifications } from '../../services/api'

function BellIcon({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 7a4 4 0 1 1 8 0v2.2c0 .5.18.99.5 1.37L13 11.5H3l.5-.93c.32-.38.5-.86.5-1.37V7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 13a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function NotificationBell(): ReactElement {
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => listMeNotifications({ limit: 50 }),
    staleTime: 30_000,
  })
  const unread =
    data?.items.filter((n) => n.read_at === null).length ?? 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : 'Notifications'
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
      >
        <BellIcon size={15} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-[#0a0a0b]">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      <NotificationsPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
