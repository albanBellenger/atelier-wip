import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import {
  listMeNotifications,
  patchMeNotificationRead,
  postMeNotificationsMarkAllRead,
} from '../../services/api'

export type NotificationsPanelProps = {
  open: boolean
  onClose: () => void
}

export function NotificationsPanel({
  open,
  onClose,
}: NotificationsPanelProps): ReactElement {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['me', 'notifications'],
    queryFn: () => listMeNotifications({ limit: 50 }),
    enabled: open,
  })

  const markOne = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      patchMeNotificationRead(id, read),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'notifications'] })
    },
  })

  const markAll = useMutation({
    mutationFn: () => postMeNotificationsMarkAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'notifications'] })
    },
  })

  const items = data?.items ?? []
  const unreadCount = items.filter((n) => n.read_at === null).length

  return (
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[92vw] flex-col border-l border-zinc-800 bg-[#0c0c0e] shadow-2xl shadow-black/60 transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4">
          <div>
            <h3 className="text-[13px] font-medium text-zinc-100">Notifications</h3>
            <p className="text-[11px] text-zinc-500">
              {unreadCount} unread · in-app inbox
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                disabled={markAll.isPending}
                onClick={() => void markAll.mutateAsync()}
              >
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto">
          {isPending ? (
            <li className="px-5 py-8 text-center text-[13px] text-zinc-500">
              Loading…
            </li>
          ) : null}
          {!isPending && items.length === 0 ? (
            <li className="px-5 py-10 text-center text-[13px] text-zinc-500">
              No notifications yet.
            </li>
          ) : null}
          {items.map((n) => (
            <li
              key={n.id}
              className={`border-b border-zinc-800/60 px-5 py-4 hover:bg-zinc-900/50 ${
                n.read_at === null ? 'bg-zinc-900/20' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-zinc-100">
                      {n.title}
                    </span>
                    <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                      {n.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                    {n.body}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {n.read_at === null ? (
                    <button
                      type="button"
                      className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                      disabled={markOne.isPending}
                      onClick={() =>
                        void markOne.mutateAsync({ id: n.id, read: true })
                      }
                    >
                      Mark read
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-900"
                      disabled={markOne.isPending}
                      onClick={() =>
                        void markOne.mutateAsync({ id: n.id, read: false })
                      }
                    >
                      Unread
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-zinc-800/80 px-5 py-3">
          <Link
            to="/me/notifications"
            className="text-[11px] text-zinc-400 hover:text-zinc-200"
            onClick={onClose}
          >
            Notification settings →
          </Link>
        </div>
      </aside>
    </>
  )
}
