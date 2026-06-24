export function cleanTitle(t: string, maxLen = 90): string {
  if (!t) return ''
  let s = t.split('\n')[0].trim()
  s = s.replace(/^["'`]+|["'`]+$/g, '')
  s = s.replace(/[\\/:*?"<>|]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (s.length > maxLen) s = s.slice(0, maxLen).trim()
  return s
}

export function toFilename(t: string): string {
  let s = (t || 'clip').replace(/[\\/:*?"<>|]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  if (s.length > 60) s = s.slice(0, 60)
  s = s.replace(/_+$/, '')
  return (s || 'clip') + '.mp4'
}

/**
 * Clamp the playbook to a character budget WITHOUT cutting mid-word or
 * mid-line — the old `slice()` left lessons truncated mid-sentence (and could
 * orphan a whole section behind a header with no body). Keeps only whole lines
 * that fit, drops a trailing section header left with nothing under it, and
 * falls back to a word-boundary cut only if the very first line already
 * overflows. Returns the text unchanged when it is already within budget.
 */
export function clampPlaybook(text: string, max: number): string {
  if (text.length <= max) return text.trim()
  const lines = text.split('\n')
  const kept: string[] = []
  let len = 0
  for (const line of lines) {
    const add = (kept.length ? 1 : 0) + line.length // +1 for the rejoining newline
    if (len + add > max) break
    kept.push(line)
    len += add
  }
  if (!kept.length) {
    const cut = text.slice(0, max)
    const sp = cut.lastIndexOf(' ')
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim()
  }
  // Never leave a dangling "## Heading" whose content was cut away.
  while (kept.length && /^\s*#{1,6}\s/.test(kept[kept.length - 1])) kept.pop()
  return kept.join('\n').trim()
}

export function snippet(text: string): string {
  const i = text.indexOf('Visual:')
  const s = (i > -1 ? text.slice(i + 7) : text).trim()
  return s.slice(0, 80) + (s.length > 80 ? '…' : '')
}

export function splitSections(text: string): { label: string; body: string }[] {
  const out: { label: string; body: string }[] = []
  const arr = ['Visual:', 'Audio:', 'Negative:']
  arr.forEach((label, i) => {
    const start = text.indexOf(label)
    if (start === -1) return
    let end = text.length
    for (let j = i + 1; j < arr.length; j++) {
      const n = text.indexOf(arr[j])
      if (n > -1) { end = n; break }
    }
    const body = text.slice(start + label.length, end).trim()
    out.push({ label, body: body ? ' ' + body : '' })
  })
  return out.length ? out : [{ label: '', body: text }]
}
