import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'

import type { SectionLayoutMode } from '../components/section/sectionLayoutMode'

const STORAGE_KEY_PREFIX = 'atelier:sectionLayout:'

function readStoredLayoutMode(sectionId: string): SectionLayoutMode {
  if (!sectionId) {
    return 'split'
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sectionId}`)
    if (
      raw === 'markdown' ||
      raw === 'preview' ||
      raw === 'split' ||
      raw === 'context' ||
      raw === 'focus'
    ) {
      return raw
    }
  } catch {
    /* ignore */
  }
  return 'split'
}

/**
 * Keeps section editor layout mode in sync with localStorage per section id.
 */
export function usePersistedSectionLayoutMode(
  sectionId: string,
): readonly [SectionLayoutMode, Dispatch<SetStateAction<SectionLayoutMode>>] {
  const [layoutMode, setLayoutMode] = useState<SectionLayoutMode>('split')

  useEffect(() => {
    if (!sectionId) {
      return
    }
    setLayoutMode(readStoredLayoutMode(sectionId))
  }, [sectionId])

  useEffect(() => {
    if (!sectionId) {
      return
    }
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${sectionId}`, layoutMode)
    } catch {
      /* ignore */
    }
  }, [layoutMode, sectionId])

  return [layoutMode, setLayoutMode] as const
}
