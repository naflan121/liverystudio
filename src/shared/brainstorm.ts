import type { Entry, SavedConcept } from './types'
import { winRateStats } from './brain'

// Livery Studio: "Concept brainstorm" — several ranked, genuinely different concepts
// from ONE call on the learning model. Anti-bias by design: proven formats are
// shown as numbers (with sample sizes), and an idea may only borrow from one when
// the data really backs it and it's relevant. Kept out of prompts.ts (the brain).

export interface BrainstormIdea {
  label: string
  brief: string
  hook: string
  why: string
  borrows: string
  score: string
}

export const BRAINSTORM_SYSTEM = `You are the concept lead for a page that posts RC scale-model aircraft videos filmed to look like genuine full-size aviation footage — the "is this real?" illusion — optimised for short-form reach (Reels, Shorts, Facebook). Your job: invent NEW short-form video CONCEPTS that could break out.

A concept is a FORMAT/SITUATION (a launch, release, recovery, incident, location, vantage point, or crew/camera choreography) — never a finished prompt, and never a specific aircraft, airline, livery or fixed setting (those are separate levers chosen later).

HOW TO WORK:
1. Privately sketch about ten raw ideas spread across DIFFERENT angles: unusual launch or release; unusual recovery or landing surface; unexpected location or vantage point; crew / ground-handling ritual; near-miss or harmless incident; "wait for it" reveal or payoff; a real RC or aviation practice few people have seen; a trend or meme format adapted to aviation. No two ideas may share the same core mechanic or the same kind of setting.
2. Score each honestly (1-5): HOOK (does the first 2 seconds stop the scroll?), ILLUSION (does it sell full-size?), GENERATABLE (can an image-to-video model render it as one ~10-second continuous shot with one clear payoff and model-plausible physics — no fine text, no complex multi-object choreography?), NOVELTY (clearly unlike everything in the tried list?).
3. Output only the best ideas requested, ranked best first.

BIAS RULES (important):
- Novelty first. Do not reskin a tried concept, and do not default to any habitual setting (desert, lake, grass field), aircraft class or camera — vary them across ideas.
- You MAY borrow an ingredient from a format only if the PERFORMANCE DATA below shows it is proven (3+ scored clips and a clearly strong Good/Viral rate) AND it genuinely serves the new idea. Then name it and its numbers in BORROWS. Otherwise BORROWS: none. At most two ideas may borrow anything.
- Formats listed as weak in the data are not banned, but an idea that leans on one must fix the reason it failed.
- The playbook is evidence about EXECUTION (realism, scale cues, pacing) — use it to make ideas work, not as a list of concepts to copy.
- Physics stays MODEL-plausible: this is always a lightweight RC model, however real it is meant to look.

OUTPUT: exactly the requested number of ideas, separated by a line containing only =====. Each idea is exactly these six lines, each on ONE line:
LABEL: <punchy 3-6 word name>
BRIEF: <2-4 sentences: the scene, camera behaviour and payoff — concrete and filmable, like a scenario brief; no aircraft/airline/livery>
HOOK: <what happens in the first 2 seconds>
WHY: <one line: why this could spread>
BORROWS: <none | the proven ingredient + its numbers>
SCORE: hook N/5 · illusion N/5 · generatable N/5 · novelty N/5
No preamble, no commentary, no markdown.`

function short(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** Proven / weak formats from real scores (3+ scored clips only) — the only "proof" the model may lean on. */
export function formatEvidence(history: Entry[]): string {
  const [dim] = winRateStats(history, [{ title: 'Scenario', key: (h) => h.scenario }])
  const rows = (dim?.rows || []).filter((r) => r.total >= 3)
  if (!rows.length) return 'PERFORMANCE DATA: not enough scored clips yet (need 3+ per format) — nothing counts as proven, so borrow nothing.'
  const fmt = (r: { label: string; wins: number; total: number; pct: number }) => `${r.label} ${r.wins}/${r.total} Good/Viral (${Math.round(r.pct)}%)`
  const strong = rows.filter((r) => r.pct >= 50).map(fmt)
  const weak = rows.filter((r) => r.pct <= 20).map(fmt)
  const mid = rows.filter((r) => r.pct > 20 && r.pct < 50).map(fmt)
  return ['PERFORMANCE DATA (real scores, formats with 3+ scored clips):',
    strong.length ? `- Proven: ${strong.join('; ')}` : '- Proven: none yet',
    mid.length ? `- Mixed: ${mid.join('; ')}` : '',
    weak.length ? `- Weak: ${weak.join('; ')}` : '',
  ].filter(Boolean).join('\n')
}

/** Every concept tried or saved, with how it did — so the brainstorm neither repeats nor ignores results. */
export function triedConceptList(history: Entry[], saved: SavedConcept[], max = 40): string[] {
  const out = new Map<string, string>()
  for (const h of history) {
    if (!h.scenarioId?.startsWith('concept:') || !h.conceptBrief?.trim()) continue
    const key = h.scenario.toLowerCase()
    if (out.has(key)) continue
    out.set(key, `${h.scenario} [${h.reach || 'unscored'}]: ${short(h.conceptBrief, 110)}`)
  }
  for (const c of saved) {
    const key = c.label.toLowerCase()
    if (!out.has(key)) out.set(key, `${c.label} [saved]: ${short(c.brief, 110)}`)
  }
  return [...out.values()].slice(0, max)
}

export function buildBrainstormMessage(n: number, playbook: string, evidence: string, tried: string[], trends = ''): string {
  return [
    `Brainstorm now and output the best ${n} ideas, ranked, following the system instructions exactly.`,
    evidence,
    tried.length ? `CONCEPTS ALREADY TRIED OR SAVED (with results) — every new idea must differ clearly in mechanic AND setting from all of these:\n${tried.map((t) => '- ' + t).join('\n')}` : 'CONCEPTS ALREADY TRIED: none yet.',
    playbook.trim() ? `PLAYBOOK (execution lessons — how to make any concept look real):\n${playbook.trim()}` : '',
    trends.trim() ? `CURRENT TRENDS (use only where it inspires a genuinely fresh angle):\n${trends.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

export function parseBrainstorm(raw: string): BrainstormIdea[] {
  return raw.split(/^\s*={3,}\s*$/m).map((block) => {
    const grab = (k: string): string => {
      const line = block.split(/\r?\n/).find((l) => l.trim().toUpperCase().startsWith(k + ':'))
      return line ? line.slice(line.indexOf(':') + 1).trim() : ''
    }
    return { label: grab('LABEL'), brief: grab('BRIEF'), hook: grab('HOOK'), why: grab('WHY'), borrows: grab('BORROWS') || 'none', score: grab('SCORE') }
  }).filter((i) => i.label && i.brief)
}

/** The brief a brainstormed idea carries into generation (its hook rides along). */
export function ideaBrief(i: BrainstormIdea): string {
  return i.hook ? `${i.brief} Opening hook: ${i.hook}` : i.brief
}
