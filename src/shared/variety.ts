import type { Entry } from './types'

// Livery Studio: cheap variety context for generation. No AI calls — the setting,
// camera and light of each prompt are read from its text with keyword rules, and a
// one-paragraph note tells the model what was already used (this batch, the last
// few clips, and anything overused lately). The model still makes every choice
// itself; this only stops it choosing blind. Dependency-free (renderer-safe).

export interface SceneTags { env: string; camera: string; light: string }

type Rule = [label: string, re: RegExp]

// Order matters only for ties (first listed wins); otherwise the most-mentioned label wins.
const ENV_RULES: Rule[] = [
  ['snow / ice', /\bsnow\w*|\bfrozen\b|\bice (?:field|sheet|runway)|\bglacier/g],
  ['desert / dry lakebed', /\bdesert\b|\bdry[- ]lake\w*|\blakebed\b|\bsalt flats?\b|\bsand dunes?\b|\barid\b|\bplaya\b/g],
  ['coastal / waterside', /\bcoast\w*|\bbeach\b|\bshore\w*|\bseaside\b|\blakeside\b|\bharbou?r\b|\bocean\b|\bsea\b|\bwaterfront\b|\bestuary\b|\briver\w*/g],
  ['mountain', /\bmountain\w*|\balpine\b|\bpeaks?\b|\bhighlands?\b|\bvalley\b|\bridgeline\b/g],
  ['urban / industrial', /\bcity\b|\burban\b|\brooftop\b|\bcar park\b|\bdowntown\b|\bindustrial\b|\bwarehouse\b/g],
  ['tarmac strip', /\btarmac\b|\bpaved\b|\basphalt\b|\bconcrete apron\b/g],
  ['grass field', /\bgrass\w*|\bfarmland\b|\bmeadow\b|\bpasture\b|\bmown\b/g],
]
const CAMERA_RULES: Rule[] = [
  ['bystander phone', /\bsmartphone\b|\bphone\b|\bhandheld\b|\beyewitness\b|\bbystander\b/g],
  ['long lens', /\btelephoto\b|\blong lens\b|\bspotter\b|\blens compression\b|\btripod\b/g],
  ['broadcast cam', /\bbroadcast\b|\bfluid[- ]head\b|\btelevision\b|\blive event\b/g],
  ['drone', /\bdrone\b|\baerial\b|\bfpv\b/g],
]
const LIGHT_RULES: Rule[] = [
  ['golden hour', /\bgolden[- ]hour\b|\bsunset\b|\bdusk\b|\blow evening sun\b/g],
  ['early morning', /\bdawn\b|\bsunrise\b|\bearly morning\b|\bmorning mist\b/g],
  ['overcast', /\bovercast\b|\bgrey sky\b|\bgray sky\b|\bcloud cover\b|\bflat light\b/g],
  ['stormy / windy', /\bstorm\w*|\bgusty\b|\brain\b|\bdrizzle\b/g],
  ['bright midday', /\bmidday\b|\bnoon\b|\bharsh sun\w*|\bbright sun\w*|\bclear blue sky\b|\bhigh sun\b/g],
]

function best(text: string, rules: Rule[]): string {
  let top = '', n = 0
  for (const [label, re] of rules) {
    const c = (text.match(re) || []).length
    if (c > n) { top = label; n = c }
  }
  return top
}

/** Setting / camera / light of a prompt, from its Visual section ('' when unclear). */
export function sceneTags(text: string): SceneTags {
  // Only the Visual section: the Negative list names things the clip must NOT show.
  const visual = (text || '').split(/\bAudio:/i)[0].split(/\bNegative:/i)[0].toLowerCase()
  return { env: best(visual, ENV_RULES), camera: best(visual, CAMERA_RULES), light: best(visual, LIGHT_RULES) }
}

/** Compact one-line label, e.g. "desert / dry lakebed · bystander phone · golden hour". */
export function sceneLabel(t: SceneTags): string {
  return [t.env, t.camera, t.light].filter(Boolean).join(' · ')
}

const RECENT = 6          // last clips on the page (any scenario, any score)
const WINDOW = 20         // overuse window
const OVERUSE_MIN = 4     // at least this many…
const OVERUSE_SHARE = 0.4 // …and this share of the window with a detectable value

function overused(values: string[]): string[] {
  const seen = values.filter(Boolean)
  if (seen.length < OVERUSE_MIN) return []
  const counts = new Map<string, number>()
  for (const v of seen) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts].filter(([, c]) => c >= OVERUSE_MIN && c / seen.length >= OVERUSE_SHARE).map(([v, c]) => `${v} (${c} of the last ${seen.length})`)
}

export interface VarietyOpts {
  /** Labels (sceneLabel) of prompts already written earlier in this batch/lineup. */
  batchUsed?: string[]
  /** Which choices are open to the model (lever on auto). */
  envOpen: boolean
  cameraOpen: boolean
}

/**
 * The variety note appended to a generation message, or '' when there is nothing
 * useful to say. Kept short on purpose (a few hundred characters).
 */
export function varietyNote(history: Entry[], o: VarietyOpts): string {
  const recentEntries = history.slice(0, WINDOW)
  const tags = recentEntries.map((h) => sceneTags(h.text || ''))
  const recent = [...new Set(tags.slice(0, RECENT).map(sceneLabel).filter(Boolean))]
  const batch = [...new Set((o.batchUsed || []).filter(Boolean))].slice(-8)
  const hot = [
    ...(o.envOpen ? overused(tags.map((t) => t.env)) : []),
    ...(o.cameraOpen ? overused(tags.map((t) => t.camera)) : []),
    ...overused(tags.map((t) => t.light)),
  ]
  if (!batch.length && !recent.length && !hot.length) return ''
  const open = [o.envOpen && 'setting', o.cameraOpen && 'camera', 'light / time of day'].filter(Boolean).join(', ')
  const lines = ['VARIETY CHECK (context for your own choices, not a new rule):']
  if (batch.length) lines.push(`- Already written earlier in this batch: ${batch.join('; ')}.`)
  if (recent.length) lines.push(`- The page's most recent clips: ${recent.join('; ')}.`)
  if (hot.length) lines.push(`- Overused lately: ${hot.join('; ')}.`)
  lines.push(`Your open choices (${open}) are still yours — pick what is genuinely strongest for THIS scenario. But do not repeat a combination from this batch, and only reuse an overused one if it is clearly the best fit for this specific clip; a fresh setting, camera or light is usually worth more reach than a safe repeat.`)
  return '\n\n' + lines.join('\n')
}
