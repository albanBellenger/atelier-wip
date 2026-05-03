import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { usePersistedSectionLayoutMode } from './usePersistedSectionLayoutMode'

describe('usePersistedSectionLayoutMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to split when storage is empty', () => {
    const { result } = renderHook(() => usePersistedSectionLayoutMode('sec-1'))
    expect(result.current[0]).toBe('split')
  })

  it('loads a valid persisted mode after mount', async () => {
    localStorage.setItem('atelier:sectionLayout:sec-1', 'focus')
    const { result } = renderHook(() => usePersistedSectionLayoutMode('sec-1'))
    await waitFor(() => {
      expect(result.current[0]).toBe('focus')
    })
  })

  it('ignores invalid persisted values', async () => {
    localStorage.setItem('atelier:sectionLayout:sec-1', 'not-a-mode')
    const { result } = renderHook(() => usePersistedSectionLayoutMode('sec-1'))
    await waitFor(() => {
      expect(result.current[0]).toBe('split')
    })
  })

  it('persists layout when setter changes mode', async () => {
    const { result } = renderHook(() => usePersistedSectionLayoutMode('sec-1'))
    await waitFor(() => {
      expect(result.current[0]).toBe('split')
    })
    act(() => {
      result.current[1]('markdown')
    })
    await waitFor(() => {
      expect(localStorage.getItem('atelier:sectionLayout:sec-1')).toBe(
        'markdown',
      )
    })
  })

  it('reloads from storage when sectionId changes', async () => {
    localStorage.setItem('atelier:sectionLayout:a', 'preview')
    localStorage.setItem('atelier:sectionLayout:b', 'markdown')
    const { result, rerender } = renderHook(
      (id: string) => usePersistedSectionLayoutMode(id),
      { initialProps: 'a' },
    )
    await waitFor(() => {
      expect(result.current[0]).toBe('preview')
    })
    rerender('b')
    await waitFor(() => {
      expect(result.current[0]).toBe('markdown')
    })
  })

  it('does not write storage when sectionId is empty', async () => {
    const { result } = renderHook(() => usePersistedSectionLayoutMode(''))
    act(() => {
      result.current[1]('focus')
    })
    await waitFor(() => {
      expect(result.current[0]).toBe('focus')
    })
    expect(localStorage.length).toBe(0)
  })
})
