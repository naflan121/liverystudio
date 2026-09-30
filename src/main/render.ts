// Render queue: prompt -> Dola (Seedance) -> watermark-free MP4 on disk.
//
// Jobs persist in renders.json (see store.ts) so the queue survives restarts: a job
// that was already sent keeps its Dola chat URL and resumes WAITING on restart
// instead of sending the prompt again. One job per Dola instance at a time
// (WebView2 exposes a single page per instance), capped per day and in parallel
// by the Render settings.

import fs from 'node:fs'
import path from 'node:path'
import { getConfig, getRenderJobs, setRenderJobs, getHistory } from './store'
import { listInstances, startInstance, getPage, forget, fillVideoPrompt, sendAndHandleBusy, waitForVideo, Cancelled } from './dola/driver'
import { resolveFallbackApi, downloadFile } from './dola/resolver'
import type { RenderJob, RenderOverview, DolaInstanceInfo, LogLevel } from '../shared/types'

const BUSY_COOLDOWN_MS = 30 * 60_000
const MAX_ATTEMPTS = 3
const TERMINAL = new Set(['done', 'failed', 'cancelled'])

type Emit = (level: LogLevel, msg: string) => void
type OnChange = (jobs: RenderJob[]) => void

let emitLog: Emit = () => { /* set by initRenderQueue */ }
let onChange: OnChange = () => { /* set by initRenderQueue */ }

let jobs: RenderJob[] = []
const activeInstances = new Set<number>()
const cooldown = new Map<number, number>() // instance id -> ms timestamp
const cancelFlags = new Map<string, boolean>()

function save(): void {
  setRenderJobs(jobs)
  onChange(jobs)
}

function patch(job: RenderJob, p: Partial<RenderJob>): void {
  Object.assign(job, p)
  save()
}

const localDay = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** Renders sent to Dola today (local time) — what the daily cap counts. */
export function sentToday(): number {
  const today = localDay(new Date())
  return jobs.filter((j) => j.sentAt && localDay(new Date(j.sentAt)) === today && j.status !== 'cancelled').length
}

export function initRenderQueue(log: Emit, change: OnChange): void {
  emitLog = log
  onChange = change
  jobs = getRenderJobs()
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
  pump()
}

export function listJobs(): RenderJob[] { return jobs }

export async function overview(): Promise<RenderOverview> {
  const cfg = getConfig().render
  const base = { jobs, sentToday: sentToday(), dailyCap: cfg.dailyCap }
  try {
    const excl = new Set(cfg.excludeInstances)
    const instances: DolaInstanceInfo[] = (await listInstances()).map((i) => ({
      id: i.id, name: i.name, kind: i.kind, status: i.status, isInitialized: i.isInitialized,
      excluded: excl.has(i.id), busy: activeInstances.has(i.id),
      cooldownUntil: (cooldown.get(i.id) ?? 0) > Date.now() ? cooldown.get(i.id) : undefined,
    }))
    return { ...base, instances }
  } catch (e: any) {
    return { ...base, instances: null, error: e?.message || String(e) }
  }
}

/** Queue a render for a history entry. Re-submitting an entry that already has a live job returns that job. */
export function submit(entryId: number): RenderJob {
  const live = jobs.find((j) => j.entryId === entryId && !TERMINAL.has(j.status))
  if (live) return live
  const entry = getHistory().find((h) => h.id === entryId)
  if (!entry) throw new Error('That prompt is no longer in history.')
  const job: RenderJob = {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    entryId, prompt: entry.text, title: entry.title || entry.scenario, filename: entry.filename || 'clip.mp4',
    status: 'queued', attempts: 0, tried: [], createdAt: new Date().toISOString(),
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
  const skip = new Set([...cfg.excludeInstances, ...job.tried])
  const free = all.filter((i) => !skip.has(i.id) && !activeInstances.has(i.id) && (cooldown.get(i.id) ?? 0) < Date.now())
  return free.find((i) => i.isInitialized) ?? (cfg.autoStartInstances ? free.find((i) => !i.isInitialized) : undefined) ?? null
}

let pumping = false, repump = false
async function pump(): Promise<void> {
  if (pumping) { repump = true; return }
  pumping = true
  try {
    do {
      repump = false
      const cfg = getConfig().render
      for (const job of [...jobs].reverse()) { // oldest first
        if (job.status !== 'queued') continue
        const resuming = !!job.chatUrl
        if (cfg.maxParallel > 0 && activeInstances.size >= cfg.maxParallel) break
        if (!resuming && sentToday() >= cfg.dailyCap) {
          const note = `Daily cap reached (${cfg.dailyCap}/day) — continues tomorrow`
          if (job.note !== note) patch(job, { note })
          continue
        }
        let inst
        try { inst = await pickInstance(job) } catch (e: any) {
          const note = e?.message || String(e)
          if (job.note !== note) patch(job, { note })
          continue
        }
        if (!inst) {
          const note = resuming ? 'Waiting for its Dola instance to be free' : 'Waiting for a free Dola instance'
          if (job.note !== note) patch(job, { note })
          continue
        }
        activeInstances.add(inst.id)
        // Reserve the daily-cap slot now so one pump pass can't overshoot the cap.
        patch(job, { status: 'starting', note: undefined, instanceId: inst.id, instanceName: inst.name, sentAt: job.sentAt ?? new Date().toISOString() })
        runJob(job, inst).finally(() => { activeInstances.delete(inst.id); cancelFlags.delete(job.id); pump() })
      }
    } while (repump)
  } finally {
    pumping = false
  }
}

async function runJob(job: RenderJob, inst: { id: number; name: string; isInitialized: boolean }): Promise<void> {
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
      patch(job, { status: 'sending' })
      emitLog('step', `Sending "${job.title}" to Dola on ${inst.name}…`)
      // Captured at send time (not queue time), so edits in Settings apply to anything still waiting.
      patch(job, { instructions: cfg.extraInstructions?.trim() || undefined })
      await fillVideoPrompt(page, { prompt: job.prompt, model: cfg.model, duration: cfg.duration, aspect: cfg.aspect, instructions: job.instructions })
      const sent = await sendAndHandleBusy(page, cancelled)
      patch(job, { chatUrl: sent.url })
      if (sent.status === 'still_busy') {
        cooldown.set(inst.id, Date.now() + BUSY_COOLDOWN_MS)
        const tried = [...job.tried, inst.id]
        if (job.attempts < MAX_ATTEMPTS) {
          emitLog('warn', `${inst.name} stayed on "high demand" — cooling it down 30 min, retrying "${job.title}" on another instance.`)
          patch(job, { status: 'queued', tried, chatUrl: undefined, sentAt: undefined, instanceId: undefined, instanceName: undefined, note: `${inst.name} was busy; retrying elsewhere` })
          return
        }
        throw new Error(`Dola stayed on "high demand" (last tried ${inst.name}).`)
      }
    }

    patch(job, { status: 'generating', note: undefined })
    emitLog('info', `Dola is generating "${job.title}" on ${inst.name} (usually 10–15 min)…`)
    const apis = await waitForVideo(page, { chatUrl: job.chatUrl, waitMinutes: cfg.waitMinutes, cancel: cancelled })

    patch(job, { status: 'downloading' })
    const v = await resolveFallbackApi(apis[apis.length - 1])
    // Local time, so filenames match the clock the user sees (toISOString would be UTC).
    const d = new Date(), p2 = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
    const file = path.join(cfg.outputDir, `${job.filename.replace(/\.mp4$/i, '')}_${stamp}.mp4`)
    const bytes = await downloadFile(v.url, file)
    fs.writeFileSync(file.replace(/\.mp4$/i, '.json'), JSON.stringify({
      entryId: job.entryId, title: job.title, prompt: job.prompt,
      model: cfg.model, duration: cfg.duration, aspect: cfg.aspect, instructions: job.instructions,
      instance: inst.name, chatUrl: job.chatUrl, width: v.width, height: v.height, bytes,
      submitted: job.createdAt, saved: new Date().toISOString(),
    }, null, 2))
    patch(job, { status: 'done', file, bytes, width: v.width, height: v.height, endedAt: new Date().toISOString(), note: undefined })
    emitLog('ok', `Video saved: ${path.basename(file)} (${(bytes / 1e6).toFixed(1)} MB)`)
  } catch (e: any) {
    if (e instanceof Cancelled) {
      patch(job, { status: 'cancelled', endedAt: new Date().toISOString(), note: undefined })
      emitLog('info', `Render cancelled: "${job.title}"`)
      return
    }
    // A failure before the prompt went out doesn't spend today's quota.
    const sentOut = !!job.chatUrl
    patch(job, { status: 'failed', error: e?.message || String(e), endedAt: new Date().toISOString(), note: undefined, ...(sentOut ? {} : { sentAt: undefined }) })
    emitLog('err', `Render failed for "${job.title}": ${e?.message || e}`)
    forget(inst.id)
  }
}
