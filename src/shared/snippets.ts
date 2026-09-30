// Direction snippets: saved phrases you add to "Direction for this one" with one click.

/** Split a direction into its comma-separated parts (trimmed, empties dropped). */
export function directionParts(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

/** True if the snippet is already one of the direction's parts (case-insensitive). */
export function hasSnippet(text: string, snippet: string): boolean {
  const s = snippet.trim().toLowerCase()
  return directionParts(text).some((p) => p.toLowerCase() === s)
}

/** Add the snippet (comma-separated) or, if it's already there, take it out. */
export function toggleSnippet(text: string, snippet: string): string {
  const s = snippet.trim()
  if (!s) return text
  const parts = directionParts(text)
  const i = parts.findIndex((p) => p.toLowerCase() === s.toLowerCase())
  if (i >= 0) parts.splice(i, 1)
  else parts.push(s)
  return parts.join(', ')
}
