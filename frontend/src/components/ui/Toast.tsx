import type { ReactElement } from 'react'
import { toast } from 'sonner'

/** Publish success: summary text plus a clickable GitLab commit link (FR §16.1). */
export function showPublishSuccessToast(
  filesCommitted: number,
  commitUrl: string,
): void {
  toast.custom(
    (): ReactElement => (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-lg">
        <p className="text-zinc-200">
          Published ({filesCommitted} file{filesCommitted === 1 ? '' : 's'}).
        </p>
        <p className="mt-2">
          <a
            href={commitUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-violet-400 underline hover:text-violet-300"
          >
            View commit ↗
          </a>
        </p>
      </div>
    ),
    { duration: 12_000 },
  )
}
