import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

/** Preserves query string for deep links from older ``/me/token-usage`` bookmarks. */
export function MeTokenUsagePage(): ReactElement {
  const { search } = useLocation()
  const to = `/llm-usage${search}`
  return <Navigate to={to} replace />
}
