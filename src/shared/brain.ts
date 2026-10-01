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

// --- Time-weighted stats (Phase 2+ brain agent) --------------------------------
//
// Same shapes as winRateStats / operatorFrequency, but each entry's contribution
// decays with age. Lets the brain stop recommending combos whose data is six
// months old — newer wins matter more. Half-life is the time for a data point's
// weight to halve; default 90 days ≈ "anything this is meaningful, anything
// older than a year is mostly background".

const MS_PER_DAY = 86_400_000
export const WEIGHT_HALF_LIFE_DAYS = 90

export function weightForAge(ageDays: number, halfLifeDays = WEIGHT_HALF_LIFE_DAYS): number {
  if (ageDays <= 0) return 1
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/** Per-dimension win rate where each entry is weighted by `weightForAge(now - ts)`. */
export function winRateStatsWeighted(history: Entry[], dims: WinRateDimSpec[], opts: { halfLifeDays?: number; nowMs?: number } = {}): WinRateDim[] {
  const now = opts.nowMs ?? Date.now()
  const halfLife = opts.halfLifeDays ?? WEIGHT_HALF_LIFE_DAYS
  const scored = scoredEntries(history)
  return dims.map(({ title, key }) => {
    const groups: Record<string, { winsW: number; totalW: number }> = {}
    for (const h of scored) {
      const k = (key(h) || '').trim()
      if (!k) continue
      const age = (now - new Date(h.ts).getTime()) / MS_PER_DAY
      const w = weightForAge(age, halfLife)
      const g = (groups[k] = groups[k] || { winsW: 0, totalW: 0 })
      g.totalW += w
      if (isWin(h)) g.winsW += w
    }
    const rows = Object.entries(groups)
      .filter(([, g]) => g.totalW >= MIN_SAMPLES) // weighted count, keeps the noise floor honest
      .map(([label, g]) => ({ label, wins: Math.round(g.winsW * 10) / 10, total: Math.round(g.totalW * 10) / 10, pct: Math.round((g.winsW / g.totalW) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.total - a.total)
    return { title, rows }
  }).filter((d) => d.rows.length > 0)
}

/** Operator/aircraft frequency where each entry is weighted by `weightForAge`. Same shape as operatorFrequency. */
export function operatorFrequencyWeighted(history: Entry[], opts: { sampleSize?: number; halfLifeDays?: number; nowMs?: number; scenarioId?: string } = {}): FrequencyRow[] {
  const sampleSize = opts.sampleSize ?? 30
  const now = opts.nowMs ?? Date.now()
  const halfLife = opts.halfLifeDays ?? WEIGHT_HALF_LIFE_DAYS
  const pool = history
    .filter((h) => h.pickedAircraft && h.pickedAircraft.trim() && !h.excludeCoverage)
    .filter((h) => !opts.scenarioId || h.scenarioId === opts.scenarioId)
    .slice(0, sampleSize)
  const weights = pool.map((h) => weightForAge((now - new Date(h.ts).getTime()) / MS_PER_DAY, halfLife))
  const total = weights.reduce((a, b) => a + b, 0)
  if (!total) return []
  const sums: Record<string, number> = {}
  for (let i = 0; i < pool.length; i++) {
    const k = pool[i].pickedAircraft!.trim()
    sums[k] = (sums[k] || 0) + weights[i]
  }
  return Object.entries(sums)
    .map(([label, w]) => ({ label, count: Math.round(w * 10) / 10, total: Math.round(total * 10) / 10, pct: Math.round((w / total) * 100) }))
    .sort((a, b) => b.count - a.count)
}

/** Median win-rate per scenario across all scored entries — the "baseline" a new result should beat. */
export function scenarioBaseline(history: Entry[], nowMs = Date.now()): Record<string, { baselinePct: number; sampleSize: number }> {
  const out: Record<string, { winsW: number; totalW: number }> = {}
  for (const h of scoredEntries(history)) {
    if (!h.scenarioId) continue
    const age = (nowMs - new Date(h.ts).getTime()) / MS_PER_DAY
    const w = weightForAge(age)
    const g = (out[h.scenarioId] = out[h.scenarioId] || { winsW: 0, totalW: 0 })
    g.totalW += w
    if (isWin(h)) g.winsW += w
  }
  const result: Record<string, { baselinePct: number; sampleSize: number }> = {}
  for (const [k, v] of Object.entries(out)) result[k] = { baselinePct: Math.round((v.winsW / v.totalW) * 100), sampleSize: Math.round(v.totalW * 10) / 10 }
  return result
}

/** Whether a recent (last `recentDays` days) win rate for a dimension+value beats its baseline. Returns null if not enough data. */
export function recentVsBaseline(history: Entry[], dimKey: (h: Entry) => string, value: string, recentDays = 14, nowMs = Date.now()): { pct: number; baselinePct: number; deltaPct: number; sampleSize: number } | null {
  const now = nowMs
  const cutoff = now - recentDays * MS_PER_DAY
  let wins = 0, total = 0
  for (const h of scoredEntries(history)) {
    if ((dimKey(h) || '').trim() !== value) continue
    if (new Date(h.ts).getTime() < cutoff) continue
    total++
    if (isWin(h)) wins++
  }
  if (total < MIN_SAMPLES) return null
  // Baseline: same value across the rest of scored history.
  let bw = 0, bt = 0
  for (const h of scoredEntries(history)) {
    if ((dimKey(h) || '').trim() !== value) continue
    if (new Date(h.ts).getTime() >= cutoff) continue
    bt++
    if (isWin(h)) bw++
  }
  const pct = Math.round((wins / total) * 100)
  const baselinePct = bt ? Math.round((bw / bt) * 100) : 0
  return { pct, baselinePct, deltaPct: pct - baselinePct, sampleSize: total }
}

// --- Scene-level failure clustering (Phase 2+ brain agent) -------------------
//
// Groups rejections by (scenarioId, reason, ~moment bucket) so the brain agent
// can spot persistent failure modes — e.g. ramp_glide + flip + ~5s = the plane
//  rolled inverted at launch across 6 different clips.

export interface FailureCluster {
  scenarioId: string | null
  reason: string
  momentBucket: string  // "0–2s", "2–4s", …, "no-time"
  count: number
  commentSamples: string[]
}

/** Bucket seconds into 2-second slices up to 10s, then 5-second slices to 30s, then ">30s" / "no-time". */
export function momentBucketFor(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'no-time'
  if (seconds < 2) return '0–2s'
  if (seconds < 4) return '2–4s'
  if (seconds < 6) return '4–6s'
  if (seconds < 8) return '6–8s'
  if (seconds < 10) return '8–10s'
  if (seconds < 15) return '10–15s'
  if (seconds < 20) return '15–20s'
  if (seconds < 30) return '20–30s'
  return '>30s'
}

/** Cluster rejections by (scenarioId, reason, momentBucket). Returns clusters with >= minCount rejections, sorted by count desc. */
export function clusterFailures(
  rejections: { scenarioId: string | null; reasons: string[]; failedAtSeconds: number | null; comment: string }[],
  minCount = 3,
): FailureCluster[] {
  const buckets = new Map<string, FailureCluster>()
  for (const r of rejections) {
    const bucket = momentBucketFor(r.failedAtSeconds)
    for (const reason of r.reasons) {
      const key = `${r.scenarioId || '?'}\u0000${reason}\u0000${bucket}`
      const cur = buckets.get(key) || { scenarioId: r.scenarioId, reason, momentBucket: bucket, count: 0, commentSamples: [] }
      cur.count++
      if (r.comment && !cur.commentSamples.includes(r.comment) && cur.commentSamples.length < 3) cur.commentSamples.push(r.comment)
      buckets.set(key, cur)
    }
  }
  return [...buckets.values()].filter((c) => c.count >= minCount).sort((a, b) => b.count - a.count)
}

export interface ScenarioStat { total: number; wins: number; pct: number }

// Win rate per scenario ID (not label — this is for matching against
// SCENARIOS[].id, unlike the display-oriented 'Scenario' dim in
// DEFAULT_WIN_RATE_DIMS which keys by label).
export function scenarioWinRates(history: Entry[]): Record<string, ScenarioStat> {
  const out: Record<string, ScenarioStat> = {}
  for (const h of scoredEntries(history)) {
    if (!h.scenarioId) continue
    const g = (out[h.scenarioId] = out[h.scenarioId] || { total: 0, wins: 0, pct: 0 })
    g.total++
    if (isWin(h)) g.wins++
  }
  for (const k of Object.keys(out)) out[k].pct = Math.round((out[k].wins / out[k].total) * 100)
  return out
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
