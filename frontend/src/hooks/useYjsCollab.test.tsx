import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { colorsForUser, useYjsCollab } from './useYjsCollab'

const {
  mockDestroy,
  mockAwareness,
  WebsocketProviderMock,
} = vi.hoisted(() => {
  const md = vi.fn()
  const ma = { setLocalStateField: vi.fn() }
  const W = vi.fn().mockImplementation(() => ({
    awareness: ma,
    destroy: md,
  }))
  return {
    mockDestroy: md,
    mockAwareness: ma,
    WebsocketProviderMock: W,
  }
})

vi.mock('y-websocket', () => ({
  WebsocketProvider: WebsocketProviderMock,
}))

vi.mock('../services/ws', () => ({
  collabWebSocketBaseUrl: (): string => 'ws://localhost:4242',
  collabRoomName: (projectId: string, sectionId: string): string =>
    `proj:${projectId}:sec:${sectionId}`,
  atelierTokenForWebSocket: (): string => 'test-token',
}))

describe('colorsForUser', () => {
  it('returns hsl strings for a known user id', () => {
    const { color, colorLight } = colorsForUser('user-stable')
    expect(color).toMatch(/^hsl\(\d+ 70% 60%\)$/)
    expect(colorLight).toMatch(/^hsl\(\d+ 70% 60% \/ 22%\)$/)
  })

  it('is deterministic for the same id', () => {
    expect(colorsForUser('same')).toEqual(colorsForUser('same'))
  })
})

describe('useYjsCollab', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when projectId is missing', () => {
    const { result } = renderHook(() =>
      useYjsCollab(undefined, 'sec-1', {
        name: 'A',
        color: 'c',
        colorLight: 'cl',
      }),
    )
    expect(result.current).toBeNull()
  })

  it('returns null when sectionId is missing', () => {
    const { result } = renderHook(() =>
      useYjsCollab('p1', undefined, {
        name: 'A',
        color: 'c',
        colorLight: 'cl',
      }),
    )
    expect(result.current).toBeNull()
  })

  it('wires WebsocketProvider and destroys on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useYjsCollab('p1', 'sec-1', null),
    )
    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })
    expect(WebsocketProviderMock).toHaveBeenCalled()
    expect(result.current?.sendMarkdownSnapshot).toBeDefined()
    unmount()
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('sets awareness user fields when user style is provided', async () => {
    const { result, unmount } = renderHook(() =>
      useYjsCollab('p1', 'sec-1', {
        name: 'Pat',
        color: 'hsl(0 0% 10%)',
        colorLight: 'hsl(0 0% 10% / 20%)',
      }),
    )
    await waitFor(() => {
      expect(result.current).not.toBeNull()
    })
    await waitFor(() => {
      expect(mockAwareness.setLocalStateField).toHaveBeenCalledWith(
        'user',
        expect.objectContaining({
          name: 'Pat',
          color: 'hsl(0 0% 10%)',
          colorLight: 'hsl(0 0% 10% / 20%)',
        }),
      )
    })
    unmount()
  })
})
