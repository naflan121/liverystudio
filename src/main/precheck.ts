// AI pre-check: a MiniMax video model watches each finished render and suggests
// approve / reject with reasons. Advisory only — you still decide in Review, and
// the reviews table records whether it agreed with you.

import { getConfig, getRenderLessons } from './store'
import { getEntry } from './db'
import { getJob, updateJob, listJobs } from './render'
import { callMiniMax } from './minimax'
import { SCENARIOS } from '../shared/domain'
import { REJECT_REASONS } from '../shared/review'
import type { LogLevel, PreCheck, RenderJob } from '../shared/types'

let emitLog: (level: LogLevel, msg: string) => void = () => { /* set by initPrecheck */ }
const queue: string[] = []
let running = false

export function initPrecheck(log: (level: LogLevel, msg: string) => void): void {
  emitLog = log
  // A check that was mid-flight when the app closed can't resume; mark it so it can be re-run.
  for (const j of listJobs()) {
    if (j.precheck?.status === 'running') updateJob(j.id, { precheck: { ...j.precheck, status: 'failed', error: 'Interrupted — run it again.' } })
  }
}

/** Queue a check. force = run even if one already finished (the Review "Run again" button). */
export function queuePrecheck(jobId: string, force = false): void {
  const job = getJob(jobId)
  if (!job || job.status !== 'done' || !job.file) return
  if (!force && job.precheck && job.precheck.status !== 'failed') return
  if (queue.includes(jobId)) return
  queue.push(jobId)
  updateJob(jobId, { precheck: { status: 'running', at: new Date().toISOString(), model: getConfig().ai.precheck.model } })
  drain()
}

async function drain(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const id = queue.shift()!
      const job = getJob(id)
      if (!job || !job.file) continue
      await check(job)
    }
  } finally { running = false }
}

function brief(job: RenderJob): { scenario: string; brief: string } {
  const entry = getEntry(job.entryId)
  const sc = entry ? SCENARIOS.find((s) => s.id === entry.scenarioId) : undefined
  return { scenario: entry?.scenario || sc?.label || 'unknown', brief: sc?.brief || entry?.conceptBrief || '' }
}

export function buildPrecheckInput(job: RenderJob, lessons: string): string {
  const { scenario, brief: b } = brief(job)
  return [
    'You are the first-pass reviewer for AI-generated videos on an RC scale-model aircraft channel.',
    'THE CONCEPT: every clip deliberately shows an RC (radio-controlled) scale model, filmed so it could pass as real full-size aviation ("is this real?"). The RC model, its size, and the staging written in the prompt are INTENTIONAL — never reject a clip for following the brief.',
    'Judge only whether the video model EXECUTED the brief well, and whether the realism holds.',
    `Reject reasons (use these ids): ${REJECT_REASONS.map((r) => `${r.id} = ${r.label}`).join('; ')}.`,
    `SCENARIO: ${scenario}${b ? ` — ${b}` : ''}`,
    lessons.trim() ? `KNOWN FAILURE PATTERNS the reviewer has rejected before:\n${lessons.trim()}` : '',
    `THE PROMPT THE VIDEO WAS GENERATED FROM:\n${job.prompt}`,
    'Watch the attached video. Reply with ONLY one JSON object, no markdown, exactly this shape:',
    '{"verdict":"approve" or "reject","confidence":number 0-1 (how sure you are of the verdict),"reasons":[reason ids, empty if approve],"notes":"max 60 words, concrete, what you saw"}',
  ].filter(Boolean).join('\n\n')
}

/** Pull the JSON object out of the model's answer and keep only valid fields. */
export function parsePrecheck(raw: string): Omit<PreCheck, 'status' | 'at' | 'model'> {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('The model did not return a JSON verdict.')
  const j = JSON.parse(raw.slice(a, b + 1))
  const verdict = j.verdict === 'reject' ? 'reject' : j.verdict === 'approve' ? 'approve' : null
  if (!verdict) throw new Error(`Unrecognised verdict: ${String(j.verdict).slice(0, 30)}`)
  const ids = new Set(REJECT_REASONS.map((r) => r.id))
  const reasons = Array.isArray(j.reasons) ? [...new Set(j.reasons.map(String).filter((r: string) => ids.has(r)))] as string[] : []
  const c = Number(j.confidence)
  return { verdict, confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : undefined, reasons: verdict === 'reject' ? reasons : [], notes: String(j.notes || '').slice(0, 600) }
}

async function check(job: RenderJob): Promise<void> {
  const cfg = getConfig()
  const model = cfg.ai.precheck.model
  emitLog('step', `AI pre-check: ${model} is watching "${job.title}"…`)
  try {
    const raw = await callMiniMax(buildPrecheckInput(job, cfg.review.useLessons ? getRenderLessons(cfg.review.lessonsBudget) : ''), {
      model, label: 'precheck', timeoutMs: 300_000, files: [job.file!], maxSteps: 2, onLog: emitLog as any,
    })
    const r = parsePrecheck(raw)
    updateJob(job.id, { precheck: { status: 'done', model, at: new Date().toISOString(), ...r } })
    emitLog('ok', `AI pre-check: likely ${r.verdict}${r.confidence != null ? ` (${Math.round(r.confidence * 100)}%)` : ''} — "${job.title}"`)
  } catch (e: any) {
    updateJob(job.id, { precheck: { status: 'failed', model, at: new Date().toISOString(), error: String(e?.message || e).slice(0, 300) } })
    emitLog('warn', `AI pre-check failed for "${job.title}": ${e?.message || e}`)
  }
}
