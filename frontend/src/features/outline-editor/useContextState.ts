import { useCallback, useMemo, useState } from 'react'

import type { OeContextGroup } from './types'

export function useContextState(groups: OeContextGroup[]): {
  included: Record<string, boolean>
  total: number
  toggle: (id: string, pinned: boolean) => void
} {
  const allIds = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => i.id)),
    [groups],
  )
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const id of allIds) init[id] = true
    return init
  })

  const total = useMemo(() => {
    let sum = 0
    for (const g of groups) {
      for (const it of g.items) {
        if (included[it.id]) sum += it.tokens
      }
    }
    return sum
  }, [groups, included])

  const toggle = useCallback((id: string, pinned: boolean) => {
    if (pinned) return
    setIncluded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return { included, total, toggle }
}
