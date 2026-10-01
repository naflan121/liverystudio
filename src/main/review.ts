// Review of rendered videos (Livery Studio, Phase 2).
//
// A verdict moves the take's MP4 + .json sidecar into approved/ or rejected/ under
// the folder it was rendered into, records the decision in the reviews table, and
// — for rejections — optionally folds the reasons into the render-lessons memory
// (one Claude call) and applies the "every take rejected" rule.

import fs from 'node:fs'
import path from 'node:path'
import { getConfig, getRenderLessons } from './store'
import { getEntry, upsertEntries, insertReview, undoLatestReview, insertLesson } from './db'
import { getJob, updateJob, listJobs, submit } from './render'
import { notify } from './notify'
import { SYSTEM, longLimit } from '../shared/prompts'
import { SCENARIOS } from '../shared/domain'
import { RENDER_LESSONS_SYSTEM, buildRenderLessonMessage, buildFixPromptMessage, parseLessonProposals, reasonLabel } from '../shared/review'
import type { Entry, JobReview, LogLevel, RenderJob, ReviewVerdict } from '../shared/types'

interface Deps {
  emitLog: (level: LogLevel, msg: string) => void
  /** Runs one Claude CLI call, serialised with the app's other CLI calls. */
  claude: (message: string, o: { system: string; label: string }) => Promise<string>
  /** Tell the renderer that history changed in the main process (new/updated entries). */
  historyChanged: () => void
}

let deps: Deps

export function initReview(d: Deps): void { deps = d }

// A skipped take stays where it was rendered.
const VERDICT_DIR: Record<'approved' | 'rejected', string> = { approved: 'approved', rejected: 'rejected' }
const targetDir = (file: string, verdict: ReviewVerdict): string => verdict === 'skipped' ? baseDir(file) : path.join(baseDir(file), VERDICT_DIR[verdict])

/** The folder the take was rendered into (strips an approved/ or rejected/ level). */
function baseDir(file: string): string {
  const dir = path.dirname(file)
  return Object.values(VERDICT_DIR).includes(path.basename(dir).toLowerCase()) ? path.dirname(dir) : dir
}

function freeName(dir: string, name: string): string {
  const ext = path.extname(name), stem = name.slice(0, -ext.length || undefined)
  let candidate = path.join(dir, name)
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${stem}_${i}${ext}`)
  return candidate
}

/** Move the MP4 and its .json sidecar into targetDir. Returns the new MP4 path. */
function moveTake(file: string, targetDir: string): string {
  if (path.resolve(path.dirname(file)).toLowerCase() === path.resolve(targetDir).toLowerCase()) return file
  if (!fs.existsSync(file)) throw new Error(`The video file is missing: ${file}`)
  fs.mkdirSync(targetDir, { recursive: true })
  const dest = freeName(targetDir, path.basename(file))
  try {
    fs.renameSync(file, dest)
  } catch (e: any) {
    if (e?.code === 'EBUSY' || e?.code === 'EPERM') throw new Error('The video is open in another program (a player?). Close it and try again.')
    throw e
  }
  const sidecar = file.replace(/\.mp4$/i, '.json')
  if (fs.existsSync(sidecar)) {
    try { fs.renameSync(sidecar, dest.replace(/\.mp4$/i, '.json')) } catch { /* the video moved; a stuck sidecar is not fatal */ }
  }
  return dest
}

function writeSidecarReview(file: string, review: JobReview | null): void {
  const sidecar = file.replace(/\.mp4$/i, '.json')
  try {
    const data = JSON.parse(fs.readFileSync(sidecar, 'utf8'))
    if (review) data.review = { ...review, reasons: review.reasons.map(reasonLabel) }
    else delete data.review
    fs.writeFileSync(sidecar, JSON.stringify(data, null, 2))
  } catch { /* sidecar missing or unreadable — the DB is the record */ }
}

export function decide(jobId: string, verdict: ReviewVerdict, reasons: string[], comment: string): RenderJob {
  const job = getJob(jobId)
  if (!job || job.status !== 'done' || !job.file) throw new Error('Only a finished render can be reviewed.')
  const at = new Date().toISOString()
  if (job.review) undoLatestReview(job.id, at) // changing a verdict supersedes the old row
  const file = moveTake(job.file, targetDir(job.file, verdict))
  const review: JobReview = { verdict, reasons: verdict === 'rejected' ? reasons : [], comment: comment.trim(), at }
  updateJob(job.id, { file, review })
  writeSidecarReview(file, review)
  const entry = getEntry(job.entryId)
  insertReview({ jobId: job.id, entryId: job.entryId, verdict, reasons: review.reasons, comment: review.comment, scenarioId: entry?.scenarioId, instance: job.instanceName, at, precheck: job.precheck?.status === 'done' ? job.precheck.verdict : undefined })
  deps.emitLog(verdict === 'rejected' ? 'warn' : verdict === 'approved' ? 'ok' : 'info', `${verdict === 'approved' ? 'Approved' : verdict === 'rejected' ? 'Rejected' : 'Skipped'}: "${job.title}"${review.reasons.length ? ` — ${review.reasons.map(reasonLabel).join(', ')}` : ''}`)

  if (verdict === 'rejected') {
    const cfg = getConfig().review
    if (cfg.learnFromRejections) learnFromRejection(job, entry).catch((e) => deps.emitLog('err', `Render-lessons update failed: ${e?.message || e}`))
    applyAllRejectedRule(job.entryId).catch((e) => deps.emitLog('err', `Automatic retry failed: ${e?.message || e}`))
  }
  return getJob(job.id)!
}

export function undo(jobId: string): RenderJob {
  const job = getJob(jobId)
  if (!job || !job.review || !job.file) throw new Error('Nothing to undo.')
  const file = moveTake(job.file, baseDir(job.file))
  updateJob(job.id, { file, review: undefined })
  writeSidecarReview(file, null)
  undoLatestReview(job.id, new Date().toISOString())
  deps.emitLog('info', `Review undone: "${job.title}" is back to awaiting review.`)
  return getJob(job.id)!
}

async function learnFromRejection(job: RenderJob, entry: Entry | undefined): Promise<void> {
  const current = getRenderLessons()
  deps.emitLog('step', 'Teaching render lessons from this rejection…')
  const raw = await deps.claude(buildRenderLessonMessage({
    current, prompt: job.prompt, instructions: job.instructions, scenario: entry?.scenario || '?',
    reasons: job.review?.reasons || [], comment: job.review?.comment || '',
  }), { system: RENDER_LESSONS_SYSTEM, label: 'render-lessons' })
  const proposals = parseLessonProposals(raw)
  if (!proposals.length) {
    deps.emitLog('info', 'No new render lessons from this rejection (the existing ones already cover it).')
    return
  }
  const ids: number[] = []
  for (const p of proposals) {
    ids.push(insertLesson({
      sourceJobId: job.id,
      sourceReasons: job.review?.reasons || [],
      sourceComment: job.review?.comment || '',
      rule: p.rule,
      category: p.category,
      confidence: 'low',
      status: 'pending',
    }))
  }
  deps.emitLog('ok', `Render lessons: +${proposals.length} candidate rule(s) from this rejection. Approve in Settings → Review to make them active.`)
}

// --- every take of a prompt rejected ---------------------------------------------

/** First prompt in a rewrite chain — auto retries are counted per chain, not per rewrite. */
function chainRoot(entry: Entry): number {
  return entry.fixOf ?? entry.id
}

function autoRetriesUsed(root: number): number {
  return listJobs().filter((j) => {
    if (!j.auto) return false
    const e = getEntry(j.entryId)
    return !!e && chainRoot(e) === root
  }).length
}

/** True when the prompt has at least one finished take and every one is rejected, with nothing still rendering. */
export function allTakesRejected(entryId: number): boolean {
  const takes = listJobs().filter((j) => j.entryId === entryId)
  if (takes.some((j) => !['done', 'failed', 'cancelled'].includes(j.status))) return false
  const done = takes.filter((j) => j.status === 'done')
  return done.length > 0 && done.every((j) => j.review?.verdict === 'rejected')
}

async function applyAllRejectedRule(entryId: number): Promise<void> {
  const cfg = getConfig().review
  if (cfg.onAllRejected === 'ask' || !allTakesRejected(entryId)) return
  const entry = getEntry(entryId)
  if (!entry) return
  const used = autoRetriesUsed(chainRoot(entry))
  if (used >= cfg.maxAutoRetries) {
    deps.emitLog('info', `Every take of "${entry.title || entry.scenario}" was rejected and the automatic retry limit (${cfg.maxAutoRetries}) is used up — waiting for you in Review.`)
    return
  }
  if (cfg.onAllRejected === 'rerender') {
    deps.emitLog('step', `Every take rejected — re-rendering "${entry.title || entry.scenario}" automatically (${used + 1}/${cfg.maxAutoRetries}).`)
    submit(entryId, { auto: 'rerender' })
    notify('autoRetry', 'Re-rendering automatically', `Every take of "${entry.title || entry.scenario}" was rejected.`, 'renders')
  } else {
    await rewriteAndRender(entryId, true)
    notify('autoRetry', 'Prompt rewritten and re-rendering', `Every take of "${entry.title || entry.scenario}" was rejected; a fixed prompt is rendering.`, 'renders')
  }
}

/** Ask the brain to fix the prompt using the rejection reasons + render lessons, save it as a new prompt, and render it. */
export async function rewriteAndRender(entryId: number, auto = false): Promise<Entry> {
  const entry = getEntry(entryId)
  if (!entry) throw new Error('That prompt is no longer in history.')
  const cfg = getConfig()
  const rejections = listJobs().filter((j) => j.entryId === entryId && j.review?.verdict === 'rejected').map((j) => j.review!)
  const scenario = SCENARIOS.find((s) => s.id === entry.scenarioId)
  const charLimit = entry.longPrompt ? longLimit({ longPromptChars: cfg.longPromptChars }) : (scenario?.charBudget || cfg.charLimit)
  deps.emitLog('step', `Rewriting "${entry.title || entry.scenario}" to fix the rejected renders…`)
  const text = (await deps.claude(buildFixPromptMessage({ prompt: entry.text, rejections, lessons: cfg.review.useLessons ? getRenderLessons() : '', charLimit }), { system: SYSTEM, label: 'fix-prompt' })).trim()
  if (!text) throw new Error('The rewrite came back empty.')
  if (text.length > charLimit) deps.emitLog('warn', `The rewritten prompt is ${text.length} chars (limit ${charLimit}).`)
  const now = Date.now()
  const fixed: Entry = {
    ...entry, id: now, text, ts: new Date(now).toISOString(), status: 'queued', postedAt: null, reach: null, tags: [], comment: '',
    views: undefined, caption: undefined, fixOf: chainRoot(entry),
  }
  // The broken prompt is superseded: mark it unusable so it stays out of reach learning.
  upsertEntries([fixed, { ...entry, status: 'skipped' }])
  deps.historyChanged()
  submit(fixed.id, auto ? { auto: 'rewrite' } : {})
  deps.emitLog('ok', `Rewritten prompt queued for rendering (${text.length} chars). The original is marked unusable.`)
  return fixed
}

export function rerender(entryId: number): RenderJob {
  return submit(entryId)
}

export function markUnusable(entryId: number): void {
  const entry = getEntry(entryId)
  if (!entry) return
  upsertEntries([{ ...entry, status: 'skipped' }])
  deps.historyChanged()
  deps.emitLog('info', `Marked unusable: "${entry.title || entry.scenario}" (excluded from learning).`)
}
