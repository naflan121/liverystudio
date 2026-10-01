// Brain Agent (Phase 2+): three small model calls that turn raw history into actionable
// lessons. Designed to be cheap and idempotent so the Studio can run it reactively
// (after N rejections), on demand (one click), and periodically (nightly maintenance).
//
// - auditLessons: review the active rules, propose strengthen/weaken/dismiss + new
// - consolidateRejections: cluster rejections by (reason, scenario, ~moment), propose new rules
// - findMissedCombos: rank lever combos that have hit on one dim but never the sibling
//
// Each function returns a structured proposal. The IPC handler is responsible for
// showing it to the operator and applying changes — nothing here auto-applies
// destructive actions without an explicit confirmation.

import type { Entry, AppConfig } from '../shared/types'
import { clusterFailures, comboWinRates, recentVsBaseline, scenarioBaseline, winRateStatsWeighted } from '../shared/brain'

export interface LessonProposal {
  action: 'add' | 'strengthen' | 'dismiss'
  /** For add: the new rule text. For strengthen/dismiss: the existing rule id. */
  ref?: number
  rule?: string
  category?: string
  reason: string
  /** Only meaningful for action='add'. Strengthen/dismiss inherit confidence from the row they reference. */
  confidence?: 'low' | 'medium' | 'high'
}

export interface LessonAuditResult {
  proposals: LessonProposal[]
  health: {
    activeCount: number
    pendingCount: number
    dismissedCount: number
    /** Rules whose matched_uses is high but uses is low — i.e. rules the reviewer keeps
     *  confirming but that don't seem to be helping generation. Candidates to dismiss. */
    staleCandidates: number[]
  }
}

export interface ClusterProposal {
  scenarioId: string | null
  reason: string
  momentBucket: string
  count: number
  sampleComments: string[]
  /** A short lesson rule the agent would propose for this cluster. */
  proposedRule: string
}

export interface MissedCombo {
  scenario: string
  camera: string
  wins: number
  total: number
  pct: number
  /** Why the agent flagged it: it has hit before (across other cameras), but not this one. */
  rationale: string
}

export interface BrainAgentDeps {
  /** Same signature as callModel in main/index.ts — kept as DI so this module stays
   *  decoupled from how the Studio chooses between Claude and MiniMax. */
  call: (modelSetting: string, message: string, opts: { system: string; label: string; timeoutMs?: number }) => Promise<string>
  /** Route from AppConfig.ai.routes — usually 'minimax:MiniMax-M3' or 'claude:claude-haiku-4-5'. */
  getRoute: () => string
  emitLog?: (level: 'info' | 'step' | 'ok' | 'warn' | 'err', msg: string) => void
}

// --- auditLessons -----------------------------------------------------------

const AUDIT_LESSONS_SYSTEM = `You maintain a list of prompt-writing rules that an AI video pipeline uses when it writes Seedance prompts. The rules were extracted from past rejections by a reviewer. Your job is to AUDIT them and propose changes.

You receive: the current active rules (id, rule text, category, confidence, uses, matched_uses), a recent history of rejections (one line each: scenario, reason, comment), and aggregate stats (per-scenario win rate, baseline, delta).

Diagnose:
- Rules with uses=0 AND matched_uses=0 are dormant — flag as dismiss candidates.
- Rules that get matched (matched_uses > 0) but have uses=0 never make it into a prompt (filter probably rejected them); flag as strengthen (the brain should use this more).
- Clusters of rejections in the same (scenario, reason, ~moment) are the strongest signal — for each cluster ≥3, propose one new rule.
- Don't propose vague advice ("improve quality"). Each rule is one concrete, reusable sentence.

Output ONLY a JSON object, no markdown, no preamble:
{
  "proposals": [
    {"action": "add", "rule": "...", "category": "...", "reason": "why this cluster exists", "confidence": "low|medium|high"},
    {"action": "strengthen", "ref": <rule id>, "reason": "why this rule should be applied more"},
    {"action": "dismiss", "ref": <rule id>, "reason": "why this rule is harmful or already covered"}
  ]
}`

export async function auditLessons(
  lessons: { id: number; rule: string; category: string | null; confidence: string; uses: number; matchedUses: number }[],
  recentRejections: { scenarioId: string | null; reasons: string[]; comment: string }[],
  baseline: Record<string, { baselinePct: number; sampleSize: number }>,
  deps: BrainAgentDeps,
  cfg: AppConfig,
): Promise<LessonAuditResult> {
  const health = {
    activeCount: lessons.filter((l) => l.confidence === 'high' || l.uses > 0).length,
    pendingCount: lessons.filter((l) => l.confidence === 'low' && l.uses === 0).length,
    dismissedCount: 0, // filled by the IPC handler from the full list
    staleCandidates: lessons.filter((l) => l.matchedUses >= 3 && l.uses === 0).map((l) => l.id),
  }
  if (!lessons.length && !recentRejections.length) return { proposals: [], health }
  const lessonBlock = lessons.length
    ? lessons.map((l) => `[#${l.id}] (${l.category || 'General'}, ${l.confidence}, uses=${l.uses}, matched=${l.matchedUses}) ${l.rule}`).join('\n')
    : '(none)'
  const rejectBlock = recentRejections.length
    ? recentRejections.slice(0, 30).map((r) => `[${r.scenarioId || '?'}] reasons=${r.reasons.join('|')} comment="${r.comment.slice(0, 120)}"`).join('\n')
    : '(no recent rejections)'
  const baselineBlock = Object.entries(baseline).map(([k, v]) => `${k} baseline=${v.baselinePct}% (n=${v.sampleSize})`).join('\n') || '(no scored history yet)'
  const msg = `CURRENT ACTIVE RULES:\n${lessonBlock}\n\nRECENT REJECTIONS (newest first, up to 30):\n${rejectBlock}\n\nPER-SCENARIO BASELINE:\n${baselineBlock}\n\nLessons size budget: ${cfg.review.lessonsBudget} chars. Be ruthless about duplicates.`
  try {
    deps.emitLog?.('step', `Brain agent auditing ${lessons.length} rule(s) against ${recentRejections.length} rejection(s)…`)
    const raw = await deps.call(deps.getRoute(), msg, { system: AUDIT_LESSONS_SYSTEM, label: 'brain-audit', timeoutMs: 240_000 })
    const parsed = parseAuditProposals(raw)
    return { proposals: parsed, health }
  } catch (e: any) {
    deps.emitLog?.('warn', `Brain agent audit failed: ${e?.message || e}`)
    return { proposals: [], health }
  }
}

function parseAuditProposals(raw: string): LessonProposal[] {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  let obj: any
  try { obj = JSON.parse(text) } catch { return [] }
  if (!obj || !Array.isArray(obj.proposals)) return []
  const out: LessonProposal[] = []
  for (const p of obj.proposals.slice(0, 8)) {
    if (!p || typeof p !== 'object') continue
    const action = p.action === 'add' || p.action === 'strengthen' || p.action === 'dismiss' ? p.action : null
    if (!action) continue
    const reason = String(p.reason || '').trim().slice(0, 240)
    if (action === 'add') {
      const rule = String(p.rule || '').trim()
      if (!rule || rule.length > 400) continue
      const category = p.category ? String(p.category).trim().slice(0, 60) || undefined : undefined
      const confidence = p.confidence === 'high' ? 'high' : p.confidence === 'medium' ? 'medium' : 'low'
      out.push({ action, rule, category, reason, confidence })
    } else {
      const ref = Number(p.ref)
      if (!Number.isFinite(ref)) continue
      out.push({ action, ref, reason })
    }
  }
  return out
}

// --- consolidateRejections --------------------------------------------------

const CONSOLIDATE_SYSTEM = `You write prompt-writing rules that an AI video pipeline uses when it generates Seedance prompts. The reviewer rejected a cluster of clips with the same (scenario, reason, ~moment-in-video). Your job is to write ONE concrete rule that, if followed next time, would have prevented the failures.

Output ONLY a JSON object, no markdown, no preamble:
{"proposals": [{"scenarioId": "...", "reason": "...", "momentBucket": "...", "rule": "one concrete sentence", "category": "short heading"}, ...]}`

export async function consolidateRejections(
  rejections: { jobId: string; entryId: number; scenarioId: string | null; reasons: string[]; failedAtSeconds: number | null; comment: string; at: string }[],
  deps: BrainAgentDeps,
): Promise<ClusterProposal[]> {
  const clusters = clusterFailures(rejections, 3)
  if (!clusters.length) return []
  const block = clusters.slice(0, 6).map((c) => `[scenario=${c.scenarioId || '?'}] [reason=${c.reason}] [moment=${c.momentBucket}] count=${c.count}\n  sample comments:\n${c.commentSamples.map((s) => `    - "${s.slice(0, 160)}"`).join('\n')}`).join('\n\n')
  const msg = `CLUSTERS OF REJECTIONS (same scenario + reason + ~moment, count >= 3):\n${block}\n\nWrite ONE rule per cluster that would have prevented the failures. Be specific and actionable.`
  try {
    deps.emitLog?.('step', `Brain agent: writing rules for ${clusters.length} failure cluster(s)…`)
    const raw = await deps.call(deps.getRoute(), msg, { system: CONSOLIDATE_SYSTEM, label: 'brain-consolidate', timeoutMs: 240_000 })
    const map = parseConsolidateProposals(raw)
    return clusters.map((c) => ({
      scenarioId: c.scenarioId,
      reason: c.reason,
      momentBucket: c.momentBucket,
      count: c.count,
      sampleComments: c.commentSamples,
      proposedRule: map.get(`${c.scenarioId || '?'}|${c.reason}|${c.momentBucket}`)
        || `${c.reason.replace(/^\w/, (s) => s.toUpperCase())} in ${c.scenarioId || 'this scenario'} around ${c.momentBucket} — see reviewer comments.`,
    }))
  } catch (e: any) {
    deps.emitLog?.('warn', `Brain agent consolidation failed: ${e?.message || e}`)
    return []
  }
}

function parseConsolidateProposals(raw: string): Map<string, string> {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  let obj: any
  try { obj = JSON.parse(text) } catch { return new Map() }
  if (!obj || !Array.isArray(obj.proposals)) return new Map()
  const out = new Map<string, string>()
  for (const p of obj.proposals) {
    if (!p || !p.rule) continue
    const key = `${p.scenarioId || '?'}|${p.reason || ''}|${p.momentBucket || ''}`
    out.set(key, String(p.rule).trim().slice(0, 400))
  }
  return out
}

// --- findMissedCombos -------------------------------------------------------
//
// Pure stats — no model call. Ranks combos that hit on one dimension but
// never on the sibling. Cheap, deterministic.

export function findMissedCombos(history: Entry[], top = 5): MissedCombo[] {
  const scenarios = new Set<string>()
  const cameras = new Set<string>()
  for (const h of history) {
    if (h.scenario) scenarios.add(h.scenario)
    if (h.camera) cameras.add(h.camera || 'auto')
  }
  const out: MissedCombo[] = []
  for (const scenario of scenarios) {
    const winsByCam = comboWinRates(history, () => scenario, (h) => h.camera || 'auto')
    const scenarioTotal = winsByCam.reduce((a, c) => a + c.total, 0)
    if (scenarioTotal < 3) continue
    const winningCams = new Set(winsByCam.filter((c) => c.pct >= 50 && c.total >= 2).map((c) => c.b))
    if (!winningCams.size) continue
    const allScored = winRateStatsWeighted(history, [{ title: 'tmp', key: () => scenario }]).flatMap((d) => d.rows)
    for (const camera of cameras) {
      if (winningCams.has(camera)) continue
      const tried = winsByCam.find((c) => c.b === camera)
      if (tried && tried.total >= 1) continue // already tried
      const baseStats = scenarioBaseline(history)
      const base = baseStats[scenario] || { baselinePct: 0, sampleSize: 0 }
      out.push({
        scenario,
        camera,
        wins: 0,
        total: 0,
        pct: 0,
        rationale: `${scenario} has hit with cameras ${[...winningCams].join(', ')} (baseline ${base.baselinePct}% on ${base.sampleSize} clip(s)) but never tried "${camera}".`,
      })
    }
  }
  return out.sort((a, b) => (b.rationale.length - a.rationale.length)).slice(0, top)
}

// --- digest / orchestrator ---------------------------------------------------

export interface BrainDigest {
  health: LessonAuditResult['health']
  newLessons: LessonProposal[]
  strengthenOrDismiss: LessonProposal[]
  missedCombos: MissedCombo[]
  clusters: ClusterProposal[]
  /** Free-text summary the operator can show in the toast / Today card. */
  summary: string
}

/** Run all three analyses and combine into one digest the UI can render. */
export async function runBrainDigest(
  history: Entry[],
  lessons: { id: number; rule: string; category: string | null; confidence: string; uses: number; matchedUses: number }[],
  recentRejections: { scenarioId: string | null; reasons: string[]; comment: string }[],
  rejections: { jobId: string; entryId: number; scenarioId: string | null; reasons: string[]; failedAtSeconds: number | null; comment: string; at: string }[],
  deps: BrainAgentDeps,
  cfg: AppConfig,
): Promise<BrainDigest> {
  const baseline = scenarioBaseline(history)
  const [audit, clusters, missed] = await Promise.all([
    auditLessons(lessons, recentRejections, baseline, deps, cfg),
    consolidateRejections(rejections, deps),
    Promise.resolve(findMissedCombos(history)),
  ])
  const newLessons = audit.proposals.filter((p) => p.action === 'add')
  const strengthenOrDismiss = audit.proposals.filter((p) => p.action !== 'add')
  const summary = [
    audit.proposals.length ? `${audit.proposals.length} lesson change(s) proposed` : null,
    clusters.length ? `${clusters.length} failure cluster(s) found` : null,
    missed.length ? `${missed.length} untried winning combo(s) suggested` : null,
  ].filter(Boolean).join(' · ') || 'Brain looked at the data and found nothing to change.'
  return { health: audit.health, newLessons, strengthenOrDismiss, missedCombos: missed, clusters, summary }
}

/** Apply a subset of new-lesson proposals as pending rows. Returns the inserted ids. */
export function applyLessonProposals(
  proposals: LessonProposal[],
  insert: (p: { rule: string; category?: string; confidence: 'low' | 'medium' | 'high'; status: 'pending'; sourceJobId?: string | null; sourceReasons?: string[]; sourceComment?: string }) => number,
): number[] {
  const out: number[] = []
  for (const p of proposals) {
    if (p.action !== 'add' || !p.rule) continue
    out.push(insert({ rule: p.rule, category: p.category, confidence: p.confidence, status: 'pending' }))
  }
  return out
}