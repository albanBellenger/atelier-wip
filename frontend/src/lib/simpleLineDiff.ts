/** Minimal line diff for preview (not a full Myers diff). */

export interface DiffLine {
  tag: ' ' | '+' | '-'
  text: string
}

export function simpleLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ tag: ' ', text: a[i] })
      i += 1
      j += 1
    } else if (j < b.length && (i >= a.length || !a.slice(i).includes(b[j]))) {
      out.push({ tag: '+', text: b[j] })
      j += 1
    } else if (i < a.length) {
      out.push({ tag: '-', text: a[i] })
      i += 1
    } else {
      out.push({ tag: '+', text: b[j] })
      j += 1
    }
  }
  return out
}
