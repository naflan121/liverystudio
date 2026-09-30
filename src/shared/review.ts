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

/** Distils rejected renders into a compact list of prompt-writing rules. {BUDGET} is replaced. */
export const RENDER_LESSONS_SYSTEM = `You maintain the RENDER LESSONS for an AI video pipeline. Prompts for RC scale-model aircraft clips are written by one model and rendered by Seedance (image/text-to-video). A human reviews every render and rejects the ones that fail.

Your job: keep a compact list of concrete prompt-writing rules that stop the same render failures from happening again. You receive the current lessons, the exact prompt that was rendered, and why the human rejected the video.

How to update:
- Diagnose which wording in the prompt most likely caused the failure (e.g. ambiguous direction of travel, too many simultaneous actions, a camera move Seedance can't hold, missing scale anchors, missing Negative terms).
- Turn that into a specific, reusable rule: what to write, what to avoid, which Negative terms to add. No vague advice ("be careful", "improve quality").
- Merge with existing lessons: strengthen or refine a rule that already covers this instead of adding a duplicate; drop rules that are contradicted.
- Group lessons under short headings by failure type. Most important first.
- Stay under {BUDGET} characters in total.

Output ONLY the full updated lessons (plain text / simple markdown bullets). No preamble.`

export function buildRenderLessonMessage(o: {
  current: string
  prompt: string
  instructions?: string
  scenario: string
  reasons: string[]
  comment: string
  budget: number
}): string {
  return [
    `CURRENT RENDER LESSONS (${o.current.length}/${o.budget} chars):`,
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

/** Appended to the brain's generation message when render lessons are on. */
export function renderLessonsBlock(lessons: string): string {
  return `\n\nRENDER LESSONS — rules learned from renders the reviewer rejected. Follow them while writing this prompt (they are about what the video model gets wrong, not about reach):\n${lessons.trim()}`
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
