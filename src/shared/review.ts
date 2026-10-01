// Review vocabulary and the render-lessons prompts (Livery Studio, Phase 2).
// Kept out of prompts.ts on purpose: that file is the Livery Lab brain, shared
// verbatim with the Lab. Renderer-safe — no Node/Electron imports.

import type { ReviewSettings } from './types'

/** Defaults for Settings → Review. Shared so the renderer can fill gaps in an older config. */
export const REVIEW_DEFAULTS: ReviewSettings = {
  learnFromRejections: true,
  useLessons: true,
  lessonsBudget: 1500,
  onAllRejected: 'ask',
  maxAutoRetries: 1,
}

/** Why a rendered video was rejected. Ids are stored; labels are shown. */
export const REJECT_REASONS: { id: string; label: string }[] = [
  { id: 'flip', label: 'Plane flipped / changed direction' },
  { id: 'toy', label: 'Toy-looking / scale giveaway' },
  { id: 'livery', label: 'Warped or wrong livery' },
  { id: 'morph', label: 'Parts morphing / extra parts' },
  { id: 'physics', label: 'Wrong physics / floaty movement' },
  { id: 'people', label: 'Crowd or people glitches' },
  { id: 'text', label: 'Text or watermark visible' },
  { id: 'offprompt', label: "Didn't follow the prompt" },
  { id: 'boring', label: 'Boring / no payoff' },
  { id: 'audio', label: 'Wrong audio' },
]

export const reasonLabel = (id: string): string => REJECT_REASONS.find((r) => r.id === id)?.label || id

/** Per-rejection prompt: extract ONE to THREE concrete rule candidates that, if followed next time,
 *  would have made the video model render the prompt correctly. Returns a JSON array — main/review.ts
 *  inserts each item as its own row in render_lessons (auditable, individually approvable). */
export const RENDER_LESSONS_SYSTEM = `You extract concrete prompt-writing rules from a failed RC scale-model aircraft clip. Prompts are written by one model and rendered by Seedance (image/text-to-video). A human reviews every render and rejects the ones that fail.

Your job for THIS one rejection:
- Diagnose which wording in the prompt most likely caused the failure (ambiguous direction of travel, too many simultaneous actions, a camera move Seedance can't hold, missing scale anchors, missing Negative terms, scale giveaway, etc.).
- Return 1-3 concrete, reusable rules that, if followed next time, would have prevented this failure.
- Each rule is one sentence. Specific and actionable. What to write / what to avoid / which Negative terms to add. No vague advice ("be careful", "improve quality").
- If the existing lessons already cover this perfectly, return an empty array.
- Group rules by failure type via the "category" field (e.g. "Camera", "Negatives", "Scale", "Movement", "Composition"). "General" if unsure.

Output ONLY a JSON array, no markdown, no preamble:
[{"rule":"<one sentence>","category":"<short heading>"}, ...]`

/** Build the user message for one rejection — current active lessons, the rejection context, the prompt. */
export function buildRenderLessonMessage(o: {
  current: string
  prompt: string
  instructions?: string
  scenario: string
  reasons: string[]
  comment: string
}): string {
  return [
    `ACTIVE RENDER LESSONS (the rules already applied to the prompt below):`,
    o.current.trim() || '(none yet)',
    '',
    `REJECTED RENDER — scenario: ${o.scenario}`,
    `Reasons: ${o.reasons.map(reasonLabel).join('; ') || '(none ticked)'}`,
    `Reviewer's comment: ${o.comment.trim() || '(none)'}`,
    o.instructions?.trim() ? `Additional instructions that were sent with it: ${o.instructions.trim()}` : '',
    '',
    'PROMPT THAT WAS RENDERED:',
    o.prompt,
  ].filter((l) => l !== '').join('\n')
}

/** Pull the first balanced JSON value out of a model response. Models often wrap JSON in a
 *  preamble ("Sure! Here you go:") or trailing chatter, and the old prose-based pipeline was
 *  immune to that — so a bare JSON.parse here would silently throw away the whole learning step.
 *  Handles: bare JSON, ```json fences, and prose-wrapped JSON. Returns null when nothing parses. */
export function extractJson(raw: string): any | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Fast path: the whole thing is valid JSON.
  try { return JSON.parse(unfenced) } catch { /* fall through to extraction */ }
  // Find the first [ or { and scan for its matching close, respecting strings and escapes.
  for (let i = 0; i < unfenced.length; i++) {
    const ch = unfenced[i]
    if (ch !== '[' && ch !== '{') continue
    const open = ch, close = ch === '[' ? ']' : '}'
    let depth = 0, inStr = false, esc = false
    for (let j = i; j < unfenced.length; j++) {
      const c = unfenced[j]
      if (esc) { esc = false; continue }
      if (c === '\\') { if (inStr) esc = true; continue }
      if (c === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (c === open) depth++
      else if (c === close) {
        depth--
        if (depth === 0) {
          try { return JSON.parse(unfenced.slice(i, j + 1)) } catch { break }
        }
      }
    }
  }
  return null
}

/** Parse Claude's JSON output back into rule rows. Tolerates preambles, fences and truncation. */
export function parseLessonProposals(raw: string): { rule: string; category: string | null }[] {
  const arr = extractJson(raw)
  if (!Array.isArray(arr)) return []
  const out: { rule: string; category: string | null }[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rule = String(item.rule || '').trim()
    if (!rule || rule.length > 400) continue
    const category = item.category ? String(item.category).trim().slice(0, 60) || null : null
    out.push({ rule, category })
    if (out.length >= 3) break
  }
  return out
}

/** Pull "at 0:06" / "at 6s" / "6 seconds in" out of a free-form comment so we can group failures
 *  by moment. Returns null when nothing is found.
 *  These are 15-second clips, so an m:ss timestamp is only a video moment when the minutes are 0
 *  or a strong video cue ("rolled", "at 6 seconds", "fails") sits next to it. A bare "at 1:23"
 *  is treated as a wall-clock time, not a moment — otherwise it would pollute the clusters. */
export function parseFailedAtSeconds(comment: string): number | null {
  const text = String(comment || '').trim()
  if (!text) return null
  const mss = text.match(/\b(\d{1,2}):([0-5]\d)\b/)
  if (mss) {
    const m = Number(mss[1]), s = Number(mss[2])
    if (m === 0) return s // unambiguous: short-form clips never reach 1:00
    if (m < 5) {
      const around = text.slice(Math.max(0, mss.index! - 16), mss.index! + mss[0].length + 16)
      // Strong cues only — "at"/"in"/"around" on their own are too common to disambiguate.
      if (/\b(sec|seconds?|rolled|flips?|flipped|broke|broken|fails?|failed|starts?|begins?|cuts?)\b/i.test(around)) return m * 60 + s
    }
  }
  // "at 6s", "at 6 sec", "6s in", "6 seconds in"
  const sec = text.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/i)
  if (sec) return Math.min(Number(sec[1]), 300)
  return null
}

/** Ask the brain (with its normal SYSTEM rules) to fix a prompt whose every take was rejected. */
export function buildFixPromptMessage(o: { prompt: string; rejections: { reasons: string[]; comment: string }[]; lessons: string; charLimit: number }): string {
  const why = o.rejections.map((r, i) => `Take ${i + 1}: ${r.reasons.map(reasonLabel).join('; ') || 'no reason ticked'}${r.comment.trim() ? ` — "${r.comment.trim()}"` : ''}`).join('\n')
  return [
    'Every rendered take of the prompt below was REJECTED by the reviewer. Rewrite it so the video model renders it correctly.',
    'Keep the same scenario, aircraft/operator, setting and story beat — fix only what caused the failures. Keep the Visual / Audio / Negative structure.',
    `Stay under ${o.charLimit} characters. Output only the rewritten prompt.`,
    '',
    'WHY THE TAKES WERE REJECTED:',
    why,
    o.lessons.trim() ? `\nRENDER LESSONS (general rules learned so far):\n${o.lessons.trim()}` : '',
    '',
    'ORIGINAL PROMPT:',
    o.prompt,
  ].join('\n')
}
