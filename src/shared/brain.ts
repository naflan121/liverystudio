import type { Entry } from './types'

// Pure stats over Entry[] — no Node/Electron imports, so this is safe to call
// from both the main process (grounding the learn/redistill/generate prompts
// in real numbers) and the renderer (surfacing the same numbers in the UI).
// history/entries are assumed newest-first, matching how they are stored
// (see store.ts setHistory) and consumed elsewhere in main/index.ts.

const MIN_SAMPLES = 2

function isWin(h: Entry): boolean {
  return h.reach === 'good' || h.reach === 'viral'
}

function scoredEntries(history: Entry[]): Entry[] {
  return history.filter((h) => h.status === 'scored' && h.reach)
}

export interface WinRateRow { label: string; wins: number; total: number; pct: number }
export interface WinRateDim { title: string; rows: WinRateRow[] }
export interface WinRateDimSpec { title: string; key: (h: Entry) => string }

// Share of scored clips that hit Good/Viral, per lever value. Only values with
// 2+ scored clips are returned — one data point isn't a signal.
export function winRateStats(history: Entry[], dims: WinRateDimSpec[]): WinRateDim[] {
  const scored = scoredEntries(history)
  return dims.map(({ title, key }) => {
    const groups: Record<string, { wins: number; total: number }> = {}
    for (const h of scored) {
      const k = (key(h) || '').trim()
      if (!k) continue
      const g = (groups[k] = groups[k] || { wins: 0, total: 0 })
      g.total++
      if (isWin(h)) g.wins++
    }
    const rows = Object.entries(groups)
      .filter(([, g]) => g.total >= MIN_SAMPLES)
      .map(([label, g]) => ({ label, wins: g.wins, total: g.total, pct: Math.round((g.wins / g.total) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.total - a.total)
    return { title, rows }
  }).filter((d) => d.rows.length > 0)
}

export const DEFAULT_WIN_RATE_DIMS: WinRateDimSpec[] = [
  { title: 'Reach Boost — A/B (report biases)', key: (h) => (h.boost ? 'boost ON' : 'boost off') },
  { title: 'Scenario', key: (h) => h.scenario },
  { title: 'Aircraft mode', key: (h) => h.aircraft },
  { title: 'Crowd', key: (h) => h.crowd },
  { title: 'Environment', key: (h) => h.env },
  { title: 'Camera', key: (h) => h.camera || 'auto' },
  { title: 'Hook mode', key: (h) => (h.hook ? 'hook on' : 'hook off') },
  { title: 'Punchy open', key: (h) => (h.punchyOpen ? 'punchy open' : 'normal open') },
]

export interface ComboRow { a: string; b: string; wins: number; total: number; pct: number }

// Cross-tab two dimensions (e.g. scenario x camera) to surface combo-level
// winners a single-dimension view hides.
export function comboWinRates(history: Entry[], keyA: (h: Entry) => string, keyB: (h: Entry) => string): ComboRow[] {
  const scored = scoredEntries(history)
  const groups: Record<string, { a: string; b: string; wins: number; total: number }> = {}
  for (const h of scored) {
    const a = (keyA(h) || '').trim()
    const b = (keyB(h) || '').trim()
    if (!a || !b) continue
    const k = `${a}\u0000${b}`
    const g = (groups[k] = groups[k] || { a, b, wins: 0, total: 0 })
    g.total++
    if (isWin(h)) g.wins++
  }
  return Object.values(groups)
    .filter((g) => g.total >= MIN_SAMPLES)
    .map((g) => ({ a: g.a, b: g.b, wins: g.wins, total: g.total, pct: Math.round((g.wins / g.total) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total)
}

export interface FrequencyRow { label: string; count: number; total: number; pct: number }

// How much of the last `sampleSize` aircraft picks each operator/type takes up
// — GLOBAL by default (all scenarios), unlike main/index.ts's recentCombos /
// recentAnyCombos which are scoped to one scenario's own recency window and so
// never catch an operator that recurs ACROSS different scenarios.
export function operatorFrequency(history: Entry[], opts: { scenarioId?: string; sampleSize?: number } = {}): FrequencyRow[] {
  const sampleSize = opts.sampleSize ?? 30
  const pool = history
    .filter((h) => h.pickedAircraft && h.pickedAircraft.trim() && !h.excludeCoverage)
    .filter((h) => !opts.scenarioId || h.scenarioId === opts.scenarioId)
    .slice(0, sampleSize)
  const total = pool.length
  if (!total) return []
  const counts: Record<string, number> = {}
  for (const h of pool) {
    const k = h.pickedAircraft!.trim()
    counts[k] = (counts[k] || 0) + 1
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count, total, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
}

// Ignore noise on small samples; flag anything eating an outsized share of
// recent picks regardless of which scenario(s) it came from.
const OVERUSE_MIN_COUNT = 4
const OVERUSE_PCT = 25

export function overusedOperators(history: Entry[], sampleSize = 30): FrequencyRow[] {
  return operatorFrequency(history, { sampleSize }).filter((r) => r.count >= OVERUSE_MIN_COUNT && r.pct >= OVERUSE_PCT)
}

// Short, human-readable + LLM-embeddable evidence lines — the strongest
// findings only, so this stays useful as a compact UI strip.
export function topInsights(history: Entry[]): string[] {
  const lines: string[] = []
  const combos = comboWinRates(history, (h) => h.scenario, (h) => h.camera || 'auto')
  if (combos.length) {
    const best = combos[0]
    lines.push(`Best bet: ${best.a} + ${best.b} → ${best.pct}% good/viral (${best.wins}/${best.total})`)
  }
  const overused = overusedOperators(history)
  if (overused.length) {
    const worst = overused[0]
    lines.push(`Currently avoiding: ${worst.label} (${worst.count} of last ${worst.total} picks)`)
  }
  return lines
}
