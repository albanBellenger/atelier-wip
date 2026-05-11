import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import {
  atelierTokenForWebSocket,
  collabRoomName,
  collabWebSocketBaseUrl,
  softwareDocCollabRoomName,
  YDOC_TEXT_FIELD,
} from '../services/ws'

export interface CollabUserStyle {
  name: string
  color: string
  colorLight: string
}

function hashHue(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0
  }
  return h % 360
}

export function colorsForUser(userId: string): {
  color: string
  colorLight: string
} {
  const hue = hashHue(userId)
  const color = `hsl(${hue} 70% 60%)`
  const colorLight = `hsl(${hue} 70% 60% / 22%)`
  return { color, colorLight }
}

export interface YjsCollab {
  ydoc: Y.Doc
  provider: WebsocketProvider
  ytext: Y.Text
  awareness: WebsocketProvider['awareness']
}

export function useYjsCollab(
  projectId: string | undefined,
  sectionId: string | undefined,
  user: CollabUserStyle | null,
): YjsCollab | null {
  const [bundle, setBundle] = useState<YjsCollab | null>(null)

  const baseUrl = useMemo(() => collabWebSocketBaseUrl(), [])

  useEffect(() => {
    if (!projectId || !sectionId) {
      setBundle(null)
      return
    }

    const roomName = collabRoomName(projectId, sectionId)
    const ydoc = new Y.Doc()
    const token = atelierTokenForWebSocket()
    const provider = new WebsocketProvider(
      baseUrl,
      roomName,
      ydoc,
      {
        connect: true,
        ...(token ? { params: { token } } : {}),
      },
    )
    const ytext = ydoc.getText(YDOC_TEXT_FIELD)
    const { awareness } = provider

    setBundle({ ydoc, provider, ytext, awareness })

    return () => {
      provider.destroy()
      ydoc.destroy()
      setBundle(null)
    }
  }, [projectId, sectionId, baseUrl])

  const userName = user?.name
  const userColor = user?.color
  const userColorLight = user?.colorLight

  useEffect(() => {
    if (!bundle || userName == null || !userColor || !userColorLight) {
      return
    }
    bundle.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
      colorLight: userColorLight,
    })
  }, [bundle, userName, userColor, userColorLight])

  return bundle
}

export function useSoftwareDocYjsCollab(
  softwareId: string | undefined,
  sectionId: string | undefined,
  user: CollabUserStyle | null,
): YjsCollab | null {
  const [bundle, setBundle] = useState<YjsCollab | null>(null)

  const baseUrl = useMemo(() => collabWebSocketBaseUrl(), [])

  useEffect(() => {
    if (!softwareId || !sectionId) {
      setBundle(null)
      return
    }

    const roomName = softwareDocCollabRoomName(softwareId, sectionId)
    const ydoc = new Y.Doc()
    const token = atelierTokenForWebSocket()
    const provider = new WebsocketProvider(
      baseUrl,
      roomName,
      ydoc,
      {
        connect: true,
        ...(token ? { params: { token } } : {}),
      },
    )
    const ytext = ydoc.getText(YDOC_TEXT_FIELD)
    const { awareness } = provider

    setBundle({ ydoc, provider, ytext, awareness })

    return () => {
      provider.destroy()
      ydoc.destroy()
      setBundle(null)
    }
  }, [softwareId, sectionId, baseUrl])

  const userName = user?.name
  const userColor = user?.color
  const userColorLight = user?.colorLight

  useEffect(() => {
    if (!bundle || userName == null || !userColor || !userColorLight) {
      return
    }
    bundle.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
      colorLight: userColorLight,
    })
  }, [bundle, userName, userColor, userColorLight])

  return bundle
}
