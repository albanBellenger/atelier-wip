import { describe, expect, it, vi } from 'vitest'

import type { EditorView } from '@milkdown/prose/view'

import {
  EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY,
  dispatchBlockHandlePointerProbe,
  findFirstParagraphEl,
  getBlockHandleProbeClientX,
  hideBlockHandleViaPointerProbe,
  queryVisibleBlockHandle,
  readEditorBlockHandleFirstRunDone,
  writeEditorBlockHandleFirstRunDone,
} from './editorBlockHandleOnboarding'

describe('editorBlockHandleOnboarding localStorage', () => {
  it('treats missing key as not done', () => {
    window.localStorage.clear()
    expect(readEditorBlockHandleFirstRunDone()).toBe(false)
  })

  it('treats stored sentinel as done', () => {
    window.localStorage.clear()
    writeEditorBlockHandleFirstRunDone()
    expect(window.localStorage.getItem(EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY)).toBe('1')
    expect(readEditorBlockHandleFirstRunDone()).toBe(true)
  })

  it('readEditorBlockHandleFirstRunDone returns true when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readEditorBlockHandleFirstRunDone()).toBe(true)
    spy.mockRestore()
  })

  it('writeEditorBlockHandleFirstRunDone swallows setItem errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeEditorBlockHandleFirstRunDone()).not.toThrow()
    spy.mockRestore()
  })
})

describe('editorBlockHandleOnboarding DOM helpers', () => {
  it('getBlockHandleProbeClientX uses editor horizontal center', () => {
    const dom = document.createElement('div')
    vi.spyOn(dom, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
      top: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => '',
    } as DOMRect)
    const view = { dom } as unknown as EditorView
    expect(getBlockHandleProbeClientX(view)).toBe(200)
  })

  it('findFirstParagraphEl returns the first paragraph element', () => {
    const dom = document.createElement('div')
    const h1 = document.createElement('h1')
    const p = document.createElement('p')
    dom.append(h1, p)
    const view = { dom } as unknown as EditorView
    expect(findFirstParagraphEl(view)).toBe(p)
  })

  it('findFirstParagraphEl returns null when there is no paragraph', () => {
    const dom = document.createElement('div')
    dom.appendChild(document.createElement('h1'))
    const view = { dom } as unknown as EditorView
    expect(findFirstParagraphEl(view)).toBeNull()
  })

  it('dispatchBlockHandlePointerProbe dispatches a bubbling pointermove on view.dom', () => {
    const dom = document.createElement('div')
    const fn = vi.fn()
    dom.addEventListener('pointermove', fn)
    const view = { dom } as unknown as EditorView
    dispatchBlockHandlePointerProbe(view, 12, 34)
    expect(fn).toHaveBeenCalledTimes(1)
    const ev = fn.mock.calls[0][0] as PointerEvent
    expect(ev.bubbles).toBe(true)
    expect(ev.clientX).toBe(12)
    expect(ev.clientY).toBe(34)
  })

  it('hideBlockHandleViaPointerProbe probes above the viewport', () => {
    const dom = document.createElement('div')
    const fn = vi.fn()
    dom.addEventListener('pointermove', fn)
    vi.spyOn(dom, 'getBoundingClientRect').mockReturnValue({
      left: 50,
      width: 100,
      top: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => '',
    } as DOMRect)
    const view = { dom } as unknown as EditorView
    hideBlockHandleViaPointerProbe(view)
    const ev = fn.mock.calls[0][0] as PointerEvent
    expect(ev.clientY).toBe(-80)
    expect(ev.clientX).toBe(100)
  })

  it('queryVisibleBlockHandle returns the handle only when data-show is true', () => {
    const host = document.createElement('div')
    const h = document.createElement('div')
    h.className = 'milkdown-block-handle'
    h.dataset.show = 'false'
    host.appendChild(h)
    expect(queryVisibleBlockHandle(host)).toBeNull()
    h.dataset.show = 'true'
    expect(queryVisibleBlockHandle(host)).toBe(h)
  })
})
