import { toast } from 'sonner'

import { parseApiError } from './parseApiError'

/** Show a toast for API / mutation failures (used by React Query mutation cache). */
export function showApiError(err: unknown): void {
  const { title, message, code } = parseApiError(err)
  const devHint =
    import.meta.env.DEV && code && code !== 'HTTP_ERROR' ? ` (${code})` : ''
  toast.error(`${title}${devHint}`, {
    description: message.length > 200 ? `${message.slice(0, 197)}…` : message,
  })
}
