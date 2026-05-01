/** True when the platform typically uses Command (⌘) as the primary modifier. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) === true
}

export function getPrimaryModLabel(): '⌘' | 'Ctrl' {
  return isApplePlatform() ? '⌘' : 'Ctrl'
}
