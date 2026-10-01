// Render queue: prompt -> Dola (Seedance) -> watermark-free MP4 on disk.
//
// Jobs persist in renders.json (see store.ts) so the queue survives restarts: a job
// that was already sent keeps its Dola chat URL and resumes WAITING on restart
// instead of sending the prompt again. One job per Dola instance at a time
// (WebView2 exposes a single page per instance), capped per day and in parallel
// by the Render settings.

import fs from 'node:fs'
import path from 'node:path'
import { getConfig, getRenderJobs, setRenderJobs } from './store'
import { getEntry, getMeta, setMeta } from './db'
import { notify } from './notify'
import { listInstances, startInstance, showInstance, waitUntilDrawn, getPage, forget, fillVideoPrompt, sendAndHandleBusy, waitForVideo, readLastReply, warmUp, assertLoggedIn, loginState, Cancelled, NoCreditsError, LoggedOutError, type CreditsInfo } from './dola/driver'
import { resolveFallbackApi, downloadFile } from './dola/resolver'
import type { RenderJob, RenderOverview, DolaInstanceInfo, LogLevel, QueuePause, InstanceUsage, LoginCheck } from '../shared/types'

const BUSY_COOLDOWN_MS = 30 * 60_000
const MAX_ATTEMPTS = 3
const TERMINAL = new Set(['done', 'failed', 'cancelled'])

type Emit = (level: LogLevel, msg: string) => void
type OnChange = (jobs: RenderJob[]) => void

let emitLog: Emit = () => { /* set by initRenderQueue */ }
let onChange: OnChange = () => { /* set by initRenderQueue */ }
/** Builds the reference-images block for a job (may call Claude once per prompt). Set by initRenderQueue. */
let resolveReferences: (job: RenderJob) => Promise<string> = async () => ''

let jobs: RenderJob[] = []
const activeInstances = new Set<number>()
const cooldown = new Map<number, number>() // instance id -> ms timestamp (persisted in meta 'dola_cooldown')
const cancelFlags = new Map<string, boolean>()
const activeJob = new Map<number, string>() // instance id -> id of the job running on it
/** What to do once a running job has been interrupted by the "Check" actions. */
type JobAction = 'rerender' | 'move' | 'cancel'
const pendingAction = new Map<string, JobAction>()
// Each run of a job gets a token; a run whose token was revoked (forced release of a
// frozen page) may no longer touch the job or free the instance.
const runTokens = new Map<string, number>()
let tokenSeq = 0

// --- Per-account usage (Dola instance manager) -----------------------------------------
// Counted at send time, per local day, persisted in meta 'dola_usage'. Drives the balanced
// picker (fewest renders today first) and the optional per-account daily limit.
let usage: Record<number, InstanceUsage> = {}
/** Sortable local day key, e.g. 2026-10-01. */
const dayKey = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function loadUsage(): void {
  const raw = getMeta('dola_usage')
  try { usage = JSON.parse(raw || '{}') } catch { usage = {} }
  if (raw) return
  // First run: seed the counters from past renders so today's numbers start right.
  for (const j of jobs) {
    if (j.instanceId == null || !j.sentAt) continue
    const u = usageOf(j.instanceId), day = dayKey(new Date(j.sentAt))
    u.total++; u.days[day] = (u.days[day] ?? 0) + 1
    if (!u.lastUsed || j.sentAt > u.lastUsed) u.lastUsed = j.sentAt
    if (j.status === 'done') u.ok++; else if (j.status === 'failed') u.failed++
  }
  saveUsage()
}
function saveUsage(): void { setMeta('dola_usage', JSON.stringify(usage)) }
function usageOf(id: number): InstanceUsage { return usage[id] || (usage[id] = { total: 0, ok: 0, failed: 0, days: {} }) }
const usedToday = (id: number): number => usage[id]?.days[dayKey()] ?? 0
function recordSend(id: number): void {
  const u = usageOf(id), day = dayKey()
  u.total++; u.days[day] = (u.days[day] ?? 0) + 1; u.lastUsed = new Date().toISOString()
  u.sinceLogin = (u.sinceLogin ?? 0) + 1
  for (const d of Object.keys(u.days).sort().slice(0, -14)) delete u.days[d] // keep two weeks
  saveUsage()
}
function recordResult(id: number, ok: boolean): void { const u = usageOf(id); if (ok) u.ok++; else u.failed++; saveUsage() }
function limitReached(id: number): boolean {
  const lim = getConfig().render.perAccountDailyCap ?? 0
  return lim > 0 && usedToday(id) >= lim
}
/** Reset one account's counters (or all). */
export function resetUsage(id?: number): void { if (id == null) usage = {}; else delete usage[id]; saveUsage(); save() }

function loadCooldown(): void {
  try { for (const [id, until] of Object.entries(JSON.parse(getMeta('dola_cooldown') || '{}') as Record<string, number>)) if (until > Date.now()) cooldown.set(+id, until) } catch { /* none */ }
}
function setCooldown(id: number, until: number): void {
  cooldown.set(id, until)
  const live: Record<string, number> = {}
  for (const [k, v] of cooldown) if (v > Date.now()) live[k] = v
  setMeta('dola_cooldown', JSON.stringify(live))
}

function save(): void {
  setRenderJobs(jobs)
  onChange(jobs)
}

function patch(job: RenderJob, p: Partial<RenderJob>): void {
  Object.assign(job, p)
  save()
}

// DolaMultiBrowser shows one instance at a time, so the show → type → send phase is
// serialised across jobs. Generation and downloading still run in parallel off-screen.
let screenChain: Promise<unknown> = Promise.resolve()
function withScreen<T>(fn: () => Promise<T>): Promise<T> {
  const run = screenChain.then(fn, fn)
  screenChain = run.then(() => undefined, () => undefined)
  return run
}

// --- Pause + Dola page guard ------------------------------------------------------
// Failures ON the Dola page while sending (missing elements, buttons that never enable,
// locator timeouts) usually mean Dola changed its page. After cfg.pauseAfterFailures of
// them in a row, new sends pause so the day's cap isn't burned on a broken page. Jobs
// already sent keep waiting/downloading. Any successful send resets the count.
const PAGE_ERROR = /locator|waitFor|Timeout \d+ms exceeded|send button|Could not switch Dola model|not being drawn|strict mode violation|Target (page|closed)|Execution context was destroyed/i
let pageFailuresInARow = 0

export function getPause(): QueuePause | null {
  try { const v = getMeta('queue_paused'); return v ? JSON.parse(v) as QueuePause : null } catch { return null }
}

export function pauseQueue(reason: string, auto = false): void {
  setMeta('queue_paused', JSON.stringify({ reason, at: new Date().toISOString(), auto } satisfies QueuePause))
  emitLog('warn', `Sending to Dola paused: ${reason}`)
  save()
}

export function resumeQueue(): void {
  setMeta('queue_paused', '')
  pageFailuresInARow = 0
  emitLog('ok', 'Sending to Dola resumed.')
  save()
  pump()
}

function notePageFailure(message: string): void {
  if (!PAGE_ERROR.test(message)) return
  pageFailuresInARow++
  const limit = getConfig().render.pauseAfterFailures
  if (limit > 0 && pageFailuresInARow >= limit && !getPause()) {
    const reason = `${pageFailuresInARow} renders in a row failed on the Dola page itself — Dola may have changed its page. Last error: ${message.split('\n')[0].slice(0, 160)}`
    pauseQueue(reason, true)
    notify('queuePaused', 'Livery Studio paused sending', 'Several renders failed on the Dola page in a row. Check Dola, then resume in Renders.', 'renders')
  }
}

let capNotifiedDay = ''

// --- Dola daily video credits ----------------------------------------------------------
// When an account replies "…will use 6 video credits. You only have 1 left today…", it rests
// until Settings → Render → credits reset hour and the job moves to another account. Not a
// failure, not a page failure, and it doesn't count toward the daily cap. Persisted in meta.
interface CreditsOut { until: number; need?: number; left?: number }
let creditsOut: Record<number, CreditsOut> = {}
function loadCredits(): void {
  try { creditsOut = JSON.parse(getMeta('dola_credits_out') || '{}') } catch { creditsOut = {} }
}
function saveCredits(): void { setMeta('dola_credits_out', JSON.stringify(creditsOut)) }
const outOfCredits = (id: number): boolean => (creditsOut[id]?.until ?? 0) > Date.now()

/** Next local time at the reset hour. */
function nextCreditReset(): number {
  const h = Math.min(23, Math.max(0, Math.round(getConfig().render.creditResetHour ?? 0)))
  const d = new Date(); d.setHours(h, 0, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
  return d.getTime()
}
const hhmm = (ms: number): string => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** Rest the account until the reset and hand the job to another account. */
function onNoCredits(job: RenderJob, inst: { id: number; name: string }, info: CreditsInfo): void {
  const until = nextCreditReset()
  creditsOut[inst.id] = { until, need: info.need, left: info.left }
  saveCredits()
  emitLog('warn', `${inst.name} is out of Dola video credits${info.need != null ? ` (a render needs ${info.need}, ${info.left ?? 0} left)` : ''} — resting it until ${hhmm(until)} and moving "${job.title}" to another account.`)
  job.attempts = Math.max(0, job.attempts - 1) // not the job's fault
  patch(job, { status: 'queued', tried: [...job.tried, inst.id], chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined, note: `${inst.name} was out of credits; moved to another account` })
}

export function clearCreditsFor(id: number): void { delete creditsOut[id]; saveCredits(); save(); pump() }
export function clearCredits(): void { creditsOut = {}; saveCredits(); emitLog('info', 'Dola credit rests cleared.'); save(); pump() }
let creditsNotifiedUntil = 0

// --- Dola logouts ----------------------------------------------------------------------
// Dola signs accounts out by itself now and then (e.g. after a number of generations). A
// logged-out account is skipped until a login check finds it logged in again — before every
// send, while waiting, from the Accounts screen, or on the optional timer. Its render moves
// to another account without counting as a try. Persisted in meta 'dola_logged_out'.
interface LoggedOutRec { since: number; reason: string }
let loggedOut: Record<number, LoggedOutRec> = {}
function loadLoggedOut(): void { try { loggedOut = JSON.parse(getMeta('dola_logged_out') || '{}') } catch { loggedOut = {} } }
function saveLoggedOut(): void { setMeta('dola_logged_out', JSON.stringify(loggedOut)) }
const isLoggedOut = (id: number): boolean => !!loggedOut[id]
/** Settings → Render → renders per login: rest the account once it has sent this many since its last login. */
function loginCapReached(id: number): boolean {
  const cap = getConfig().render.perLoginCap ?? 0
  return cap > 0 && (usage[id]?.sinceLogin ?? 0) >= cap
}
let noAccountNotified = false

/** Mark an account logged out (once) and remember how many renders it had sent. Returns true if it was new. */
function markLoggedOut(inst: { id: number; name: string }, reason: string): boolean {
  if (loggedOut[inst.id]) return false
  loggedOut[inst.id] = { since: Date.now(), reason }
  saveLoggedOut()
  const u = usageOf(inst.id)
  u.logoutsAfter = [...(u.logoutsAfter ?? []), u.sinceLogin ?? 0].slice(-10)
  saveUsage()
  forget(inst.id)
  return true
}

/** Logged back in: clear the mark and start counting renders-since-login again. */
function markLoggedIn(inst: { id: number; name: string }): void {
  if (!loggedOut[inst.id]) return
  delete loggedOut[inst.id]
  saveLoggedOut()
  usageOf(inst.id).sinceLogin = 0
  saveUsage()
  noAccountNotified = false
  emitLog('ok', `${inst.name} is logged in to Dola again — back in the render rotation.`)
}

function onLoggedOut(job: RenderJob, inst: { id: number; name: string }, reason: string): void {
  const fresh = markLoggedOut(inst, reason)
  const after = usage[inst.id]?.logoutsAfter?.slice(-1)[0]
  const afterTxt = after != null ? ` after ${after} render${after === 1 ? '' : 's'}` : ''
  emitLog('warn', `Dola logged ${inst.name} out${afterTxt} (${reason}) — moving "${job.title}" to another account. Log in again on ${inst.name}, then Check login on the Accounts screen.`)
  if (fresh) notify('loggedOut', `Dola logged ${inst.name} out`, `${after != null ? `After ${after} renders. ` : ''}"${job.title}" moved to another account. Log in again, then Check login on Accounts.`, 'instances')
  job.attempts = Math.max(0, job.attempts - 1) // not the job's fault
  const earlier = job.chatUrl ? ` (earlier chat: ${job.chatUrl})` : ''
  patch(job, { status: 'queued', chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined, note: `${inst.name} was logged out of Dola; moved to another account${earlier}` })
}

/**
 * Login check (Accounts screen, timer): one account, or every running one. Reads each page
 * as it is — no navigation — so it's safe while a render runs on it.
 */
export async function checkLogins(id?: number): Promise<LoginCheck[]> {
  const all = await listInstances()
  const targets = id == null ? all.filter((i) => i.isInitialized) : all.filter((i) => i.id === id)
  const out = await Promise.all(targets.map(async (i): Promise<LoginCheck> => {
    if (!i.isInitialized) return { id: i.id, name: i.name, loggedIn: null, reason: `not running (${i.status})` }
    try {
      const { page } = await getPage(i.id)
      const st = await loginState(page)
      if (st.loggedIn === true) markLoggedIn(i)
      else if (st.loggedIn === false && markLoggedOut(i, st.reason)) {
        emitLog('warn', `${i.name} is logged out of Dola (${st.reason}) — skipped until it's logged in again.`)
        notify('loggedOut', `Dola logged ${i.name} out`, 'Log in again on that account, then Check login on Accounts.', 'instances')
      }
      return { id: i.id, name: i.name, ...st }
    } catch (e: any) {
      return { id: i.id, name: i.name, loggedIn: null, reason: e?.message || String(e) }
    }
  }))
  save(); pump()
  return out
}

/** Start the renders-since-login count again (e.g. after logging out and in by hand). */
export function resetLoginCount(id: number): void { usageOf(id).sinceLogin = 0; saveUsage(); save(); pump() }
let lastLoginSweep = Date.now()

// Called once per finished render (the AI pre-check hooks in here).
let onRenderDone: (job: RenderJob) => void = () => { /* set by index.ts */ }
export function setOnRenderDone(fn: (job: RenderJob) => void): void { onRenderDone = fn }

const localDay = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** Renders sent to Dola today (local time) — what the daily cap counts. */
export function sentToday(): number {
  const today = localDay(new Date())
  return jobs.filter((j) => j.sentAt && localDay(new Date(j.sentAt)) === today && j.status !== 'cancelled').length
}

export function initRenderQueue(log: Emit, change: OnChange, refs?: (job: RenderJob) => Promise<string>): void {
  emitLog = log
  onChange = change
  if (refs) resolveReferences = refs
  jobs = getRenderJobs()
  loadCredits()
  loadCooldown()
  loadUsage()
  loadLoggedOut()
  // Anything mid-flight when the app last closed: resume waiting if it was already
  // sent (chatUrl known), otherwise put it back in the queue from scratch.
  let resumed = 0, requeued = 0
  for (const j of jobs) {
    if (TERMINAL.has(j.status) || j.status === 'queued') continue
    if (j.chatUrl) { j.status = 'queued'; j.note = 'Resuming wait after restart'; resumed++ }
    else { j.status = 'queued'; j.sentAt = undefined; j.note = 'Re-queued after restart'; requeued++ }
  }
  if (resumed || requeued) { setRenderJobs(jobs); emitLog('info', `Render queue restored: ${resumed} resuming, ${requeued} re-queued.`) }
  setInterval(() => { if (jobs.some((j) => j.status === 'queued')) pump() }, 60_000).unref?.()
  // Optional login sweep (Settings → Render → check logins every N minutes).
  setInterval(() => {
    const m = getConfig().render.loginCheckMinutes ?? 0
    if (m > 0 && Date.now() - lastLoginSweep >= m * 60_000) { lastLoginSweep = Date.now(); checkLogins().catch(() => { /* Control API down — try next time */ }) }
  }, 60_000).unref?.()
  pump()
}

export function listJobs(): RenderJob[] { return jobs }

export async function overview(): Promise<RenderOverview> {
  const cfg = getConfig().render
  const base = { jobs, sentToday: sentToday(), dailyCap: cfg.dailyCap, paused: getPause() }
  try {
    const excl = new Set(cfg.excludeInstances)
    const instances: DolaInstanceInfo[] = (await listInstances()).map((i) => ({
      id: i.id, name: i.name, kind: i.kind, status: i.status, isInitialized: i.isInitialized,
      excluded: excl.has(i.id), busy: activeInstances.has(i.id),
      sentToday: usedToday(i.id), total: usage[i.id]?.total ?? 0, ok: usage[i.id]?.ok ?? 0, failed: usage[i.id]?.failed ?? 0, lastUsed: usage[i.id]?.lastUsed,
      limitReached: limitReached(i.id) || undefined,
      currentJob: activeJob.has(i.id) ? getJob(activeJob.get(i.id)!)?.title : undefined,
      cooldownUntil: (cooldown.get(i.id) ?? 0) > Date.now() ? cooldown.get(i.id) : undefined,
      ...(outOfCredits(i.id) ? { creditsOutUntil: creditsOut[i.id].until, creditsNeed: creditsOut[i.id].need, creditsLeft: creditsOut[i.id].left } : {}),
      ...(loggedOut[i.id] ? { loggedOutSince: loggedOut[i.id].since, loggedOutReason: loggedOut[i.id].reason } : {}),
      sinceLogin: usage[i.id]?.sinceLogin ?? 0,
      logoutsAfter: usage[i.id]?.logoutsAfter,
      loginCapReached: loginCapReached(i.id) || undefined,
    }))
    return { ...base, instances }
  } catch (e: any) {
    return { ...base, instances: null, error: e?.message || String(e) }
  }
}

export function getJob(jobId: string): RenderJob | undefined {
  return jobs.find((j) => j.id === jobId)
}

/** Patch a job from outside the queue (e.g. a review moved its file). */
export function updateJob(jobId: string, p: Partial<RenderJob>): RenderJob | undefined {
  const job = getJob(jobId)
  if (job) patch(job, p)
  return job
}

/** Queue a render for a history entry. Re-submitting an entry that already has a live job returns that job. */
export function submit(entryId: number, opts: { auto?: RenderJob['auto']; references?: boolean } = {}): RenderJob {
  const live = jobs.find((j) => j.entryId === entryId && !TERMINAL.has(j.status))
  if (live) return live
  const entry = getEntry(entryId)
  if (!entry) throw new Error('That prompt is no longer in history.')
  const job: RenderJob = {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    entryId, prompt: entry.text, title: entry.title || entry.scenario, filename: entry.filename || 'clip.mp4',
    status: 'queued', attempts: 0, tried: [], createdAt: new Date().toISOString(),
    ...(opts.auto ? { auto: opts.auto } : {}),
    ...(typeof opts.references === 'boolean' ? { useReferences: opts.references } : {}),
  }
  jobs.unshift(job)
  save()
  emitLog('step', `Render queued: "${job.title}"`)
  pump()
  return job
}

export function cancel(jobId: string): void {
  const job = jobs.find((j) => j.id === jobId)
  if (!job || TERMINAL.has(job.status)) return
  if (job.status === 'queued') {
    patch(job, { status: 'cancelled', endedAt: new Date().toISOString(), note: undefined })
  } else {
    cancelFlags.set(job.id, true)
    patch(job, { note: 'Cancelling…' })
  }
}

/** fresh=false re-checks the existing Dola chat for the video (no re-send); fresh=true renders again from scratch. */
export function retry(jobId: string, fresh: boolean): void {
  const job = jobs.find((j) => j.id === jobId)
  if (!job || !TERMINAL.has(job.status)) return
  const reset: Partial<RenderJob> = { status: 'queued', error: undefined, note: undefined, attempts: 0, tried: [], endedAt: undefined }
  if (fresh || !job.chatUrl) Object.assign(reset, { chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined })
  patch(job, reset)
  pump()
}

// ---------- "Check" on a sent job: read Dola's last reply, then act on it ----------

export interface ReplyRead { text: string; hasVideo: boolean; instanceName: string; sentAt?: string; status: RenderJob['status'] }

/** Read the last reply in the job's Dola chat without disturbing anything else running. */
export async function readJobReply(jobId: string): Promise<ReplyRead> {
  const job = getJob(jobId)
  if (!job) throw new Error('That render is no longer in the list.')
  if (!job.chatUrl || job.instanceId == null) throw new Error('This render has not reached Dola yet — nothing to read.')
  const holder = activeJob.get(job.instanceId)
  if (holder && holder !== job.id) throw new Error(`${job.instanceName || 'Its Dola account'} is busy with another render, so its chat can't be opened right now. Try again in a bit, or Move this one to another account.`)
  const { page } = await getPage(job.instanceId)
  // Only navigate when nothing is running on this instance; a running job keeps its own chat open.
  if (!holder && page.url() !== job.chatUrl) await page.goto(job.chatUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(holder ? 0 : 2500)
  const r = await readLastReply(page)
  return { text: r.text, hasVideo: r.hasVideo, instanceName: job.instanceName || `instance ${job.instanceId}`, sentAt: job.sentAt, status: job.status }
}

function applyAction(job: RenderJob, action: JobAction, instId?: number): void {
  const name = job.instanceName || (instId != null ? `instance ${instId}` : 'its Dola account')
  if (action === 'cancel') {
    patch(job, { status: 'cancelled', endedAt: new Date().toISOString(), note: undefined })
    emitLog('info', `Render cancelled: "${job.title}"`)
  } else {
    const tried = action === 'move' && instId != null ? [...new Set([...job.tried, instId])] : job.tried
    patch(job, { status: 'queued', attempts: 0, tried, error: undefined, endedAt: undefined, chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined,
      note: action === 'move' ? `Moved off ${name}; waiting for another account` : 'Re-rendering from scratch' })
    emitLog('info', action === 'move' ? `"${job.title}" moved off ${name} — sending it to another account.` : `Re-rendering "${job.title}" from scratch.`)
  }
  pump()
}

/**
 * Act on a sent job after a Check: re-render from scratch, move it to another account, or
 * cancel it. cooldownMinutes > 0 also rests the job's current account so new renders skip it.
 * A running job is interrupted first (its wait stops at the next poll), then the action applies.
 */
export function actOnJob(jobId: string, action: JobAction, cooldownMinutes = 0): void {
  const job = getJob(jobId)
  if (!job) return
  const instId = job.instanceId
  if (cooldownMinutes > 0 && instId != null) {
    setCooldown(instId, Date.now() + cooldownMinutes * 60_000)
    emitLog('info', `${job.instanceName || `Instance ${instId}`} is cooling down for ${cooldownMinutes >= 60 ? `${Math.round(cooldownMinutes / 60)} h` : `${cooldownMinutes} min`} — new renders will skip it.`)
  }
  const running = instId != null && activeJob.get(instId) === job.id
  if (running) {
    pendingAction.set(job.id, action)
    cancelFlags.set(job.id, true)
    // A frozen Dola page never reaches the next cancel check — release it by force after a minute.
    const token = runTokens.get(job.id)
    setTimeout(() => {
      if (instId == null || runTokens.get(job.id) !== token || activeJob.get(instId) !== job.id) return
      runTokens.delete(job.id); activeInstances.delete(instId); activeJob.delete(instId); cancelFlags.delete(job.id); pendingAction.delete(job.id)
      forget(instId)
      emitLog('warn', `${job.instanceName || `Instance ${instId}`} did not respond — released "${job.title}" by force.`)
      applyAction(job, action, instId)
    }, 60_000).unref?.()
    patch(job, { note: action === 'cancel' ? 'Cancelling…' : action === 'move' ? 'Stopping here to move it…' : 'Stopping to re-render…' })
    return
  }
  if (job.status === 'done') return
  applyAction(job, action, instId)
}

/** Instance manager: start a stopped account / bring one on screen in DolaMultiBrowser. */
export async function startAccount(id: number): Promise<void> { await startInstance(id); save() }
export async function showAccount(id: number): Promise<void> { await showInstance(id) }

/** Clear a cooldown early (Renders → instances). */
export function clearCooldown(id: number): void { cooldown.delete(id); setCooldown(id, 0); save(); pump() }

export function remove(jobId: string): void {
  const job = jobs.find((j) => j.id === jobId)
  if (!job || !TERMINAL.has(job.status)) return
  jobs = jobs.filter((j) => j !== job)
  save()
}

// ---------- scheduling ----------

async function pickInstance(job: RenderJob): Promise<{ id: number; name: string; isInitialized: boolean } | null> {
  const cfg = getConfig().render
  const all = await listInstances()
  // A job already sent must finish on the instance holding its chat.
  if (job.chatUrl && job.instanceId != null) {
    const inst = all.find((i) => i.id === job.instanceId)
    if (!inst) throw new Error(`Dola instance ${job.instanceId} no longer exists.`)
    return activeInstances.has(inst.id) ? null : inst
  }
  const skip = new Set([...cfg.excludeInstances, ...job.tried.filter((id) => !(creditsOut[id] && !outOfCredits(id)))])
  const free = all.filter((i) => !skip.has(i.id) && !activeInstances.has(i.id) && (cooldown.get(i.id) ?? 0) < Date.now() && !outOfCredits(i.id) && !limitReached(i.id) && !isLoggedOut(i.id) && !loginCapReached(i.id))
  if (cfg.pickStrategy === 'first') return free.find((i) => i.isInitialized) ?? (cfg.autoStartInstances ? free.find((i) => !i.isInitialized) : undefined) ?? null
  // Balanced: fewest renders today, then least recently used, then one that's already running.
  const pool = free.filter((i) => i.isInitialized || cfg.autoStartInstances)
  const last = (id: number): number => (usage[id]?.lastUsed ? new Date(usage[id].lastUsed!).getTime() : 0)
  pool.sort((a, b) => usedToday(a.id) - usedToday(b.id) || last(a.id) - last(b.id) || Number(b.isInitialized) - Number(a.isInitialized))
  return pool[0] ?? null
}

let pumping = false, repump = false
async function pump(): Promise<void> {
  if (pumping) { repump = true; return }
  pumping = true
  try {
    do {
      repump = false
      const cfg = getConfig().render
      const paused = getPause()
      for (const job of [...jobs].reverse()) { // oldest first
        if (job.status !== 'queued') continue
        // Sent on an account Dola has since logged out: its chat is out of reach, so send again elsewhere.
        if (job.chatUrl && job.instanceId != null && isLoggedOut(job.instanceId)) {
          patch(job, { chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined, note: `${job.instanceName || 'Its account'} was logged out of Dola; sending again on another account (earlier chat: ${job.chatUrl})` })
        }
        const resuming = !!job.chatUrl
        if (paused && !resuming) {
          const note = 'Sending paused — resume it on the Renders page'
          if (job.note !== note) patch(job, { note })
          continue
        }
        if (cfg.maxParallel > 0 && activeInstances.size >= cfg.maxParallel) break
        if (!resuming && sentToday() >= cfg.dailyCap) {
          const note = `Daily cap reached (${cfg.dailyCap}/day) — continues tomorrow`
          if (job.note !== note) patch(job, { note })
          const day = localDay(new Date())
          if (capNotifiedDay !== day) { capNotifiedDay = day; notify('capReached', 'Daily render cap reached', `${cfg.dailyCap} renders sent today. Queued prompts continue tomorrow.`, 'renders') }
          continue
        }
        let inst
        try { inst = await pickInstance(job) } catch (e: any) {
          const note = e?.message || String(e)
          if (job.note !== note) patch(job, { note })
          continue
        }
        if (!inst && !resuming) {
          // Every usable account resting on credits? Say so (and notify once per reset window).
          const usable = (await listInstances().catch(() => [])).filter((i) => !cfg.excludeInstances.includes(i.id))
          if (usable.length && usable.every((i) => outOfCredits(i.id))) {
            const back = Math.min(...usable.map((i) => creditsOut[i.id].until))
            const note = `All Dola accounts are out of video credits — continues at ${hhmm(back)}`
            if (job.note !== note) patch(job, { note })
            if (creditsNotifiedUntil !== back) { creditsNotifiedUntil = back; notify('creditsOut', 'Dola accounts are out of video credits', `Renders continue at ${hhmm(back)}, when Dola's daily credits reset.`, 'renders') }
            continue
          }
        }
        if (!inst && !resuming) {
          // Nothing left but logged-out / login-limit accounts? Say what to do.
          const usable = (await listInstances().catch(() => [])).filter((i) => !cfg.excludeInstances.includes(i.id))
          const out = usable.filter((i) => isLoggedOut(i.id)).length, capped = usable.filter((i) => !isLoggedOut(i.id) && loginCapReached(i.id)).length
          if (usable.length && (out || capped) && usable.every((i) => isLoggedOut(i.id) || loginCapReached(i.id) || outOfCredits(i.id) || limitReached(i.id))) {
            const why = [out ? `${out} logged out of Dola` : '', capped ? `${capped} at the renders-per-login limit` : ''].filter(Boolean).join(', ')
            const note = `No account can render right now (${why}) — log them in again, then Check login on Accounts`
            if (job.note !== note) patch(job, { note })
            if (!noAccountNotified) { noAccountNotified = true; notify('loggedOut', 'No Dola account can render', `${why[0].toUpperCase()}${why.slice(1)}. Log them in again, then Check login on Accounts.`, 'instances') }
            continue
          }
        }
        if (!inst && !resuming && (cfg.perAccountDailyCap ?? 0) > 0) {
          const usable = (await listInstances().catch(() => [])).filter((i) => !cfg.excludeInstances.includes(i.id))
          if (usable.length && usable.every((i) => limitReached(i.id) || outOfCredits(i.id))) {
            const note = `Every account has reached its per-account limit (${cfg.perAccountDailyCap}/day) — continues tomorrow`
            if (job.note !== note) patch(job, { note })
            continue
          }
        }
        if (!inst) {
          const note = resuming ? 'Waiting for its Dola instance to be free' : 'Waiting for a free Dola instance'
          if (job.note !== note) patch(job, { note })
          continue
        }
        activeInstances.add(inst.id)
        activeJob.set(inst.id, job.id)
        const token = ++tokenSeq
        runTokens.set(job.id, token)
        // Reserve the daily-cap slot now so one pump pass can't overshoot the cap.
        patch(job, { status: 'starting', note: undefined, instanceId: inst.id, instanceName: inst.name, sentAt: job.sentAt ?? new Date().toISOString() })
        runJob(job, inst, token).finally(() => {
          if (runTokens.get(job.id) === token) { runTokens.delete(job.id); activeInstances.delete(inst.id); activeJob.delete(inst.id); cancelFlags.delete(job.id); pendingAction.delete(job.id) }
          pump()
        })
      }
    } while (repump)
  } finally {
    pumping = false
  }
}

async function runJob(job: RenderJob, inst: { id: number; name: string; isInitialized: boolean }, token: number): Promise<void> {
  const stale = (): boolean => runTokens.get(job.id) !== token
  /** patch() for this run only: a released (stale) run stops here instead of overwriting the job. */
  const own = (p: Partial<RenderJob>): void => { if (stale()) throw new Cancelled(); patch(job, p) }
  const cfg = getConfig().render
  const cancelled = (): boolean => cancelFlags.get(job.id) === true
  job.attempts++
  const resuming = !!job.chatUrl
  try {
    if (!inst.isInitialized) {
      emitLog('info', `Starting Dola instance ${inst.name}…`)
      await startInstance(inst.id)
    }
    const { page } = await getPage(inst.id)

    if (!resuming) {
      own({ status: 'sending' })
      // Captured at send time (not queue time), so edits in Settings apply to anything still waiting.
      let references = ''
      if (job.useReferences ?? cfg.referenceImages) {
        try { references = await resolveReferences(job) } catch (e: any) { emitLog('warn', `Reference images skipped for "${job.title}": ${e?.message || e}`) }
      }
      own({ instructions: cfg.extraInstructions?.trim() || undefined, references: references || undefined })
      // Only the instance DolaMultiBrowser has on screen is drawn, so typing is one job at a time:
      // show this instance, type, send (and ride out "high demand"), then hand the screen on.
      own({ note: 'Waiting for its turn on screen' })
      const sent = await withScreen(async () => {
        if (cancelled()) throw new Cancelled()
        own({ note: undefined })
        emitLog('step', `Sending "${job.title}" to Dola on ${inst.name}…`)
        await showInstance(inst.id)
        if (!(await waitUntilDrawn(page))) throw new Error(`${inst.name} is not being drawn on screen in DolaMultiBrowser, so its chat box can't be typed into. Is DolaMultiBrowser minimised?`)
        await assertLoggedIn(page, inst.name)
        // Warm-up: say hello in a new chat, wait for the reply, then send the video prompt in that chat.
        const warm = cfg.warmup ?? true
        if (warm) {
          const msg = (cfg.warmupMessage ?? '').trim() || 'Hi'
          own({ note: `Warm-up: "${msg}"` })
          const w = await warmUp(page, msg, cancelled)
          if (w.busy) emitLog('warn', `${inst.name} answered the warm-up with "high demand" — sending the video prompt anyway (busy retry applies).`)
          else if (!w.replied) emitLog('warn', `${inst.name} didn't answer the warm-up within 90 s — sending the video prompt anyway.`)
          await assertLoggedIn(page, inst.name)
          own({ note: undefined })
        }
        await fillVideoPrompt(page, { prompt: job.prompt, model: cfg.model, duration: cfg.duration, aspect: cfg.aspect, instructions: job.instructions, references: job.references, newChat: !warm })
        await assertLoggedIn(page, inst.name)
        return sendAndHandleBusy(page, cancelled)
      })
      own({ chatUrl: sent.url })
      recordSend(inst.id)
      pageFailuresInARow = 0 // the page worked
      if (stale()) throw new Cancelled()
      if (sent.status === 'no_credits') { onNoCredits(job, inst, sent.credits || { text: '' }); return }
      if (sent.status === 'still_busy') {
        setCooldown(inst.id, Date.now() + BUSY_COOLDOWN_MS)
        const tried = [...job.tried, inst.id]
        if (job.attempts < MAX_ATTEMPTS) {
          emitLog('warn', `${inst.name} stayed on "high demand" — cooling it down 30 min, retrying "${job.title}" on another instance.`)
          own({ status: 'queued', tried, chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined, note: `${inst.name} was busy; retrying elsewhere` })
          return
        }
        throw new Error(`Dola stayed on "high demand" (last tried ${inst.name}).`)
      }
    }

    own({ status: 'generating', note: undefined })
    emitLog('info', `Dola is generating "${job.title}" on ${inst.name} (usually 10–15 min)…`)
    const apis = await waitForVideo(page, { chatUrl: job.chatUrl, waitMinutes: cfg.waitMinutes, cancel: cancelled, account: inst.name })

    own({ status: 'downloading' })
    const v = await resolveFallbackApi(apis[apis.length - 1])
    // Local time, so filenames match the clock the user sees (toISOString would be UTC).
    const d = new Date(), p2 = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
    const file = path.join(cfg.outputDir, `${job.filename.replace(/\.mp4$/i, '')}_${stamp}.mp4`)
    const bytes = await downloadFile(v.url, file)
    fs.writeFileSync(file.replace(/\.mp4$/i, '.json'), JSON.stringify({
      entryId: job.entryId, title: job.title, prompt: job.prompt,
      model: cfg.model, duration: cfg.duration, aspect: cfg.aspect, instructions: job.instructions, references: job.references,
      instance: inst.name, chatUrl: job.chatUrl, width: v.width, height: v.height, bytes,
      submitted: job.createdAt, saved: new Date().toISOString(),
    }, null, 2))
    recordResult(inst.id, true)
    own({ status: 'done', file, bytes, width: v.width, height: v.height, endedAt: new Date().toISOString(), note: undefined })
    emitLog('ok', `Video saved: ${path.basename(file)} (${(bytes / 1e6).toFixed(1)} MB)`)
    notify('renderDone', 'Render ready for review', job.title, 'review')
    try { onRenderDone(job) } catch { /* the pre-check is optional */ }
  } catch (e: any) {
    if (stale()) return // released by a forced Check action — the job has already moved on
    if (e instanceof NoCreditsError) { onNoCredits(job, inst, e.info); return }
    if (e instanceof LoggedOutError) { onLoggedOut(job, inst, e.reason); return }
    if (e instanceof Cancelled) {
      const action = pendingAction.get(job.id)
      if (action) { pendingAction.delete(job.id); cancelFlags.delete(job.id); applyAction(job, action, inst.id); return }
      patch(job, { status: 'cancelled', endedAt: new Date().toISOString(), note: undefined })
      emitLog('info', `Render cancelled: "${job.title}"`)
      return
    }
    // A failure before the prompt went out doesn't spend today's quota.
    const sentOut = !!job.chatUrl
    if (sentOut) recordResult(inst.id, false)
    patch(job, { status: 'failed', error: e?.message || String(e), endedAt: new Date().toISOString(), note: undefined, ...(sentOut ? {} : { sentAt: undefined }) })
    emitLog('err', `Render failed for "${job.title}": ${e?.message || e}`)
    notify('renderFailed', 'Render failed', `${job.title} — ${String(e?.message || e).split('\n')[0].slice(0, 120)}`, 'renders')
    if (!sentOut) notePageFailure(String(e?.message || e))
    forget(inst.id)
  }
}
