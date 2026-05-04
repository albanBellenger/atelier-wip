import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  atelierTokenForWebSocket,
  collabRoomName,
  collabWebSocketBaseUrl,
  openProjectChatWebSocket,
  openSoftwareChatWebSocket,
  projectChatWebSocketUrl,
  softwareChatWebSocketUrl,
  YDOC_TEXT_FIELD,
} from './ws'

describe('ws helpers', () => {
  afterEach(() => {
    document.cookie =
      'atelier_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    vi.unstubAllEnvs()
  })

  it('YDOC_TEXT_FIELD is the documented constant', () => {
    expect(YDOC_TEXT_FIELD).toBe('codemirror')
  })

  it('collabRoomName composes project + section path', () => {
    expect(collabRoomName('p1', 'sec1')).toBe(
      'projects/p1/sections/sec1/collab',
    )
  })

  describe('atelierTokenForWebSocket', () => {
    it('returns null when no atelier_token cookie is set', () => {
      expect(atelierTokenForWebSocket()).toBeNull()
    })

    it('returns the token when set', () => {
      document.cookie = 'atelier_token=abc123; path=/'
      expect(atelierTokenForWebSocket()).toBe('abc123')
    })

    it('decodes percent-encoded tokens', () => {
      document.cookie =
        'atelier_token=' + encodeURIComponent('a b/c') + '; path=/'
      expect(atelierTokenForWebSocket()).toBe('a b/c')
    })

    it('returns the raw cookie value when decoding fails', () => {
      document.cookie = 'atelier_token=%E0%A4%A; path=/'
      expect(atelierTokenForWebSocket()).toBe('%E0%A4%A')
    })
  })

  describe('collabWebSocketBaseUrl', () => {
    it('returns wss://… when VITE_API_BASE_URL is https', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')
      expect(collabWebSocketBaseUrl()).toBe('wss://api.example.com/ws')
    })

    it('returns ws://… when VITE_API_BASE_URL is http', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'http://api.example.com')
      expect(collabWebSocketBaseUrl()).toBe('ws://api.example.com/ws')
    })

    it('falls back to window.location host when env is unset', () => {
      vi.stubEnv('VITE_API_BASE_URL', '')
      expect(collabWebSocketBaseUrl()).toMatch(/^ws:\/\/.+\/ws$/)
    })
  })

  it('projectChatWebSocketUrl composes correctly', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    expect(projectChatWebSocketUrl('p1')).toBe(
      'wss://api.example.com/ws/projects/p1/chat',
    )
  })

  describe('openProjectChatWebSocket', () => {
    let ctorSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      ctorSpy = vi.fn()
      vi.stubGlobal('WebSocket', ctorSpy as unknown as typeof WebSocket)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('opens a WebSocket without token query when no cookie set', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
      openProjectChatWebSocket('p1')
      expect(ctorSpy).toHaveBeenCalledWith(
        'wss://api.example.com/ws/projects/p1/chat',
      )
    })

    it('appends ?token=… when cookie present', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
      document.cookie = 'atelier_token=tok-xyz; path=/'
      openProjectChatWebSocket('p1')
      const url = ctorSpy.mock.calls[0]?.[0] as string
      expect(url).toMatch(/\?token=tok-xyz$/)
    })
  })

  it('softwareChatWebSocketUrl composes correctly', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
    expect(softwareChatWebSocketUrl('sw1')).toBe(
      'wss://api.example.com/ws/software/sw1/chat',
    )
  })

  describe('openSoftwareChatWebSocket', () => {
    let ctorSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      ctorSpy = vi.fn()
      vi.stubGlobal('WebSocket', ctorSpy as unknown as typeof WebSocket)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('opens a WebSocket without token query when no cookie set', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
      openSoftwareChatWebSocket('sw1')
      expect(ctorSpy).toHaveBeenCalledWith(
        'wss://api.example.com/ws/software/sw1/chat',
      )
    })

    it('appends ?token=… when cookie present', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com')
      document.cookie = 'atelier_token=tok-abc; path=/'
      openSoftwareChatWebSocket('sw1')
      const url = ctorSpy.mock.calls[0]?.[0] as string
      expect(url).toMatch(/\?token=tok-abc$/)
    })
  })
})
