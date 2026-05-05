import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'atelier:userEditorPrefs'

export interface EditorV2Prefs {
  outlineEditorV2: boolean
  outlineRailPinned: boolean
  outlineRawDefault: boolean
}

const DEFAULTS: EditorV2Prefs = {
  outlineEditorV2: false,
  outlineRailPinned: false,
  outlineRawDefault: false,
}

function parseStored(raw: string | null): Partial<EditorV2Prefs> {
  if (raw == null || raw === '') {
    return {}
  }
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    return {
      outlineEditorV2:
        typeof j.outlineEditorV2 === 'boolean' ? j.outlineEditorV2 : undefined,
      outlineRailPinned:
        typeof j.outlineRailPinned === 'boolean'
          ? j.outlineRailPinned
          : undefined,
      outlineRawDefault:
        typeof j.outlineRawDefault === 'boolean'
          ? j.outlineRawDefault
          : undefined,
    }
  } catch {
    return {}
  }
}

function readPrefs(): EditorV2Prefs {
  try {
    const partial = parseStored(localStorage.getItem(STORAGE_KEY))
    return {
      outlineEditorV2: partial.outlineEditorV2 ?? DEFAULTS.outlineEditorV2,
      outlineRailPinned: partial.outlineRailPinned ?? DEFAULTS.outlineRailPinned,
      outlineRawDefault: partial.outlineRawDefault ?? DEFAULTS.outlineRawDefault,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function writePrefs(next: EditorV2Prefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** Per-user editor preferences (localStorage only — no backend fields). */
export function useEditorV2Prefs(): EditorV2Prefs & {
  setOutlineEditorV2: (v: boolean) => void
  setOutlineRailPinned: (v: boolean) => void
  setOutlineRawDefault: (v: boolean) => void
  replacePrefs: (next: Partial<EditorV2Prefs>) => void
} {
  const [prefs, setPrefs] = useState<EditorV2Prefs>(() =>
    typeof window === 'undefined' ? DEFAULTS : readPrefs(),
  )

  useEffect(() => {
    setPrefs(readPrefs())
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY) {
        setPrefs(readPrefs())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const replacePrefs = useCallback((partial: Partial<EditorV2Prefs>): void => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial }
      writePrefs(next)
      return next
    })
  }, [])

  const setOutlineEditorV2 = useCallback((v: boolean): void => {
    replacePrefs({ outlineEditorV2: v })
  }, [replacePrefs])

  const setOutlineRailPinned = useCallback((v: boolean): void => {
    replacePrefs({ outlineRailPinned: v })
  }, [replacePrefs])

  const setOutlineRawDefault = useCallback((v: boolean): void => {
    replacePrefs({ outlineRawDefault: v })
  }, [replacePrefs])

  return useMemo(
    () => ({
      ...prefs,
      setOutlineEditorV2,
      setOutlineRailPinned,
      setOutlineRawDefault,
      replacePrefs,
    }),
    [
      prefs,
      setOutlineEditorV2,
      setOutlineRailPinned,
      setOutlineRawDefault,
      replacePrefs,
    ],
  )
}
