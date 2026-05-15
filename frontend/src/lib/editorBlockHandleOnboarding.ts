import type { EditorView } from '@milkdown/prose/view'

/** Persisted after the block-handle onboarding has been shown once. */
export const EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY = 'atelier:editor:firstRun:v1'

export function readEditorBlockHandleFirstRunDone(): boolean {
  try {
    return window.localStorage.getItem(EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY) === '1'
  } catch {
    return true
  }
}

export function writeEditorBlockHandleFirstRunDone(): void {
  try {
    window.localStorage.setItem(EDITOR_BLOCK_HANDLE_FIRST_RUN_LS_KEY, '1')
  } catch {
    /* private mode / quota */
  }
}

/** Center X used by Milkdown block plugin pointer probes (see @milkdown/plugin-block). */
export function getBlockHandleProbeClientX(view: EditorView): number {
  const rect = view.dom.getBoundingClientRect()
  return rect.left + rect.width / 2
}

/**
 * First paragraph in the ProseMirror surface (Milkdown commonmark).
 * Onboarding targets this block only; headings-only seeds skip the hint.
 */
export function findFirstParagraphEl(view: EditorView): HTMLElement | null {
  const el = view.dom.querySelector('p')
  return el instanceof HTMLElement ? el : null
}

export function dispatchBlockHandlePointerProbe(
  view: EditorView,
  clientX: number,
  clientY: number,
): void {
  view.dom.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      pointerId: 1,
      pointerType: 'mouse',
    }),
  )
}

/** Move the virtual probe outside the doc so the block plugin hides the handle. */
export function hideBlockHandleViaPointerProbe(view: EditorView): void {
  const x = getBlockHandleProbeClientX(view)
  dispatchBlockHandlePointerProbe(view, x, -80)
}

export function queryVisibleBlockHandle(hostEl: HTMLElement): HTMLElement | null {
  const h = hostEl.querySelector('.milkdown-block-handle')
  if (!(h instanceof HTMLElement)) {
    return null
  }
  return h.dataset.show === 'true' ? h : null
}
