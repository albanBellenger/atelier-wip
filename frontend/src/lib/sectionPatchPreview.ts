/** Build proposed full markdown after a patch (for preview only). */

export function previewAfterAppend(snapshot: string, markdownToAppend: string): string {
  if (!markdownToAppend) {
    return snapshot
  }
  if (snapshot.length === 0) {
    return markdownToAppend
  }
  const sep = snapshot.endsWith('\n') ? '' : '\n\n'
  return snapshot + sep + markdownToAppend
}

/** Preview replace_selection using the client's selected plaintext at send time (not LLM offsets). */
export function previewAfterReplace(
  snapshot: string,
  replacementMarkdown: string,
  selectedPlaintext: string,
): string {
  if (!selectedPlaintext) {
    return snapshot
  }
  const idx = snapshot.indexOf(selectedPlaintext)
  if (idx < 0) {
    return snapshot
  }
  return (
    snapshot.slice(0, idx) +
    replacementMarkdown +
    snapshot.slice(idx + selectedPlaintext.length)
  )
}

export function previewAfterEdit(
  snapshot: string,
  oldSnippet: string,
  newSnippet: string,
): string {
  const i = snapshot.indexOf(oldSnippet)
  if (i < 0) {
    return snapshot
  }
  return snapshot.slice(0, i) + newSnippet + snapshot.slice(i + oldSnippet.length)
}

/** Short human-readable diff-ish lines (not a full Myers diff). */
export function summarizeTextChange(before: string, after: string, maxLines: number): string[] {
  const bLines = before.split('\n')
  const aLines = after.split('\n')
  const out: string[] = []
  const lim = Math.max(bLines.length, aLines.length)
  for (let i = 0; i < lim && out.length < maxLines; i += 1) {
    const bl = bLines[i] ?? ''
    const al = aLines[i] ?? ''
    if (bl !== al) {
      out.push(`Line ${i + 1}: - ${bl.slice(0, 120)}${bl.length > 120 ? '…' : ''}`)
      out.push(`Line ${i + 1}: + ${al.slice(0, 120)}${al.length > 120 ? '…' : ''}`)
    }
  }
  if (out.length === 0) {
    return ['(no line-level changes detected)']
  }
  return out
}
