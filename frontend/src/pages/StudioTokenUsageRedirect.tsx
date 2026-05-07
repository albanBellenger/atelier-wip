import type { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { withUtcMonthQuery } from '../lib/utcMonthBounds'

/** Legacy ``/studios/:id/token-usage`` → ``/llm-usage`` with studio filter and UTC month bounds. */
export function StudioTokenUsageRedirect(): ReactElement {
  const { studioId } = useParams<{ studioId: string }>()
  const sid = studioId?.trim() ?? ''
  const search = sid ? `studio_id=${encodeURIComponent(sid)}` : ''
  return <Navigate to={`/llm-usage${withUtcMonthQuery(search)}`} replace />
}
