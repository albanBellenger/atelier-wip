import { useCallback, useState } from 'react'

export interface OutlineSelection {
  blockId: string
}

export function useSelection(): {
  selection: OutlineSelection | null
  setSelection: (s: OutlineSelection | null) => void
  clearSelection: () => void
} {
  const [selection, setSelection] = useState<OutlineSelection | null>(null)
  const clearSelection = useCallback(() => {
    setSelection(null)
  }, [])
  return { selection, setSelection, clearSelection }
}
