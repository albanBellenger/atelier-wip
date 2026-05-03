/** Human-readable line for the copilot “recent updates” feed after remote Yjs edits. */
export function summarizePeerEdit(remoteNames: string[]): string {
  const n = [
    ...new Set(
      remoteNames
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ]
  if (n.length === 1) {
    return `${n[0]} edited the section`
  }
  if (n.length === 2) {
    return `${n[0]} and ${n[1]} edited the section`
  }
  if (n.length > 2) {
    return `${n[0]}, ${n[1]}, and others edited the section`
  }
  return 'Collaborators edited the section'
}
