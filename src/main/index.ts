import { app, shell, dialog, BrowserWindow, ipcMain, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { callClaude, testCli } from './claude'
import {
  getConfig, setConfig, getHistory, setHistory, getPlaybook, setPlaybook,
  getPlaybookVersions, appendLearningLog, getLearningLog, resetMemory, dataDir, setDataDir,
  getTrends, setTrends, getSavedConcepts, setSavedConcepts, importFromLiveryLab, liveryLabDataDir, pullNewFromLab, initStorage, backupStorage, getRenderLessons, setRenderLessons,
} from './store'
import { closeDb, reviewStatsByScenario, rejectReasonCounts } from './db'
import { initReview, decide as reviewDecide, undo as reviewUndo, rewriteAndRender, rerender, markUnusable } from './review'
import { renderLessonsBlock } from '../shared/review'
import { initRenderQueue, overview as renderOverview, submit as renderSubmit, cancel as renderCancel, retry as renderRetry, remove as renderRemove, listJobs } from './render'
import { SYSTEM, TITLE_SYSTEM, LEARN_SYSTEM, EXTRACT_SYSTEM, TREND_SYSTEM, CAPTION_SYSTEM, CONCEPT_SYSTEM, LONG_PROMPT_CHARS, buildUserMessage, titleMsg, captionMsg, buildLearnMessage, buildRedistillMessage, buildConceptMessage, extractMsg, parseScene, parseConcept, trendsMsg, parseVariants } from '../shared/prompts'
import { cleanTitle, toFilename, clampPlaybook } from '../shared/util'
import { overusedOperators } from '../shared/brain'
import type { GenerateRequest, Entry, LogLevel, SavedConcept } from '../shared/types'

let win: BrowserWindow | null = null

// Mechanical airliner-ID extraction is a trivial classification — always run it on
// a fast/cheap model regardless of the (stronger) learning model used for distilling.
const FAST_MODEL = 'claude-haiku-4-5'

/** Push a structured line to the renderer's activity log. */
function emitLog(level: LogLevel, msg: string): void {
  try {
    if (win && !win.isDestroyed()) win.webContents.send('log:line', { ts: Date.now(), level, msg })
  } catch { /* window gone — drop the line */ }
}
const claudeLog = (level: 'info' | 'ok' | 'warn' | 'err', msg: string): void => emitLog(level, msg)

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 700,
    minHeight: 600,
    backgroundColor: '#FBFAF7',
    title: 'Livery Studio',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // If the UI bundle ever fails to load, show a readable message instead of a
  // blank white window — and never leave the user staring at nothing.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return // ERR_ABORTED — a benign in-flight navigation, ignore
    const html = `<body style="font-family:ui-monospace,monospace;background:#FBFAF7;color:#1C1B19;padding:28px">
      <h2 style="color:#B23A2E">Couldn't load the interface</h2>
      <p>${desc} (${code})</p><p style="color:#6B6862;word-break:break-all">${url}</p>
      <button onclick="location.reload()" style="background:#E85D1A;color:#fff;border:none;border-radius:9px;padding:9px 16px;font-size:14px;cursor:pointer">Reload</button>
    </body>`
    win?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    // eslint-disable-next-line no-console
    console.error('Renderer process gone:', details.reason)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// --- Serialise CLI calls so generation and learning never overlap. ---
let chain: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.then(() => undefined, () => undefined)
  return run
}

function recentTitles(history: Entry[]): string[] {
  const arr = history.filter((h) => h.title && h.title.trim()).map((h) => h.title.trim())
  return [...new Set(arr)].slice(0, 8)
}

// Airline+model combos that have already done WELL (Good/Viral) for one scenario,
// newest first, deduped. Drives per-scenario variety: once a combo lands, steer
// the next prompt to a fresh airline/model so coverage broadens. Combos that
// flopped or were never scored are not here, so they stay available to retry.
const COMBO_MEMORY = 12
function recentCombos(history: Entry[], scenarioId: string): string[] {
  const arr = history
    .filter((h) => h.scenarioId === scenarioId && h.aircraft !== 'placeholder'
      && (h.reach === 'good' || h.reach === 'viral') && !h.excludeCoverage
      && h.pickedAircraft && h.pickedAircraft.trim())
    .map((h) => h.pickedAircraft!.trim())
  return [...new Set(arr)].slice(0, COMBO_MEMORY)
}

// Airline+model combos used for this scenario in the last few generations,
// regardless of score — a short-term "you just used this" signal so back-to-back
// runs don't converge on the same pick before it's even been scored. Distinct from
// recentCombos above (which only tracks combos that scored well, by design, so an
// unscored or flopped repeat stays retryable there).
const RECENT_MEMORY = 5
function recentAnyCombos(history: Entry[], scenarioId: string): string[] {
  const arr = history
    .filter((h) => h.scenarioId === scenarioId && h.aircraft !== 'placeholder' && !h.excludeCoverage
      && h.pickedAircraft && h.pickedAircraft.trim())
    .map((h) => h.pickedAircraft!.trim())
  return [...new Set(arr)].slice(0, RECENT_MEMORY)
}

// Global (all-scenario) overuse check. recentCombos/recentAnyCombos above are
// each scoped to ONE scenario's own recency window, so an operator that keeps
// recurring ACROSS different scenarios (e.g. picked for cliff_drop, ramp_glide
// and runway_takeoff independently) never trips either window. This looks at
// the page's actual pick frequency instead, regardless of scenario.
function overusedAircraft(history: Entry[]): string[] {
  return overusedOperators(history).map((r) => r.label)
}

// Concepts already tried (one-off or from a saved concept) or explicitly
// saved — fed back to the concept-inventor so it doesn't reinvent one.
const CONCEPT_MEMORY = 10
function triedConceptBriefs(history: Entry[], saved: SavedConcept[]): string[] {
  const fromHistory = history
    .filter((h) => h.scenarioId && h.scenarioId.startsWith('concept:') && h.conceptBrief && h.conceptBrief.trim())
    .map((h) => `${h.scenario}: ${h.conceptBrief!.trim()}`)
  const fromSaved = saved.map((c) => `${c.label}: ${c.brief}`)
  return [...new Set([...fromSaved, ...fromHistory])].slice(0, CONCEPT_MEMORY)
}

// Settings/environments that have done well for one scenario — fed only when the
// user opts in via "Vary using coverage", to push the engine to a fresh setting.
function recentEnvs(history: Entry[], scenarioId: string): string[] {
  const arr = history
    .filter((h) => h.scenarioId === scenarioId && (h.reach === 'good' || h.reach === 'viral')
      && !h.excludeCoverage && h.pickedEnv && h.pickedEnv.trim())
    .map((h) => h.pickedEnv!.trim())
  return [...new Set(arr)].slice(0, COMBO_MEMORY)
}

// Announcer lines already generated for the ramp-glide scenario, newest first.
// Extracted from the quoted speech in each prompt's Audio section and fed back
// as an avoid list — without it the model drifts to the same "it's still
// going!" call for every airline. The fixed countdown is excluded (it is meant
// to repeat every clip).
function recentAnnouncerLines(history: Entry[]): string[] {
  const lines: string[] = []
  for (const h of history) {
    if (h.scenarioId !== 'ramp_glide') continue
    const audio = h.text.split(/\bAudio:/i)[1]?.split(/\bNegative:/i)[0]
    if (!audio) continue
    for (const m of audio.matchAll(/["“”]([^"“”]{3,90})["“”]/g)) {
      const line = m[1].trim()
      if (/three\W+.*two\W+.*one/i.test(line)) continue
      if (!/\s/.test(line)) continue // single-word quotes are crowd noise ("ooooh"), not commentary
      lines.push(line)
    }
  }
  return [...new Set(lines)].slice(0, COMBO_MEMORY)
}

// --- studio-media:// — lets the renderer <video> play rendered MP4s -----------
// Only files that belong to a render job are served, with HTTP Range support so
// the player can seek (a plain file fetch can't).
protocol.registerSchemesAsPrivileged([{ scheme: 'studio-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

function registerMediaProtocol(): void {
  protocol.handle('studio-media', (req) => {
    const jobId = new URL(req.url).hostname
    const file = listJobs().find((j) => j.id.toLowerCase() === jobId.toLowerCase())?.file
    if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 })
    const size = fs.statSync(file).size
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '')
    if (!m) {
      return new Response(Readable.toWeb(fs.createReadStream(file)) as any, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
    }
    const start = m[1] ? +m[1] : Math.max(0, size - +m[2])
    const end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as any, {
      status: 206,
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' },
    })
  })
}

// Livery Studio: rules learned from rejected renders ride along on every new prompt
// (Settings → Review). Appended outside the brain's own message builder.
function withRenderLessons(message: string): string {
  const cfg = getConfig()
  const lessons = cfg.review.useLessons ? getRenderLessons().trim() : ''
  if (!lessons) return message
  emitLog('info', `Render lessons attached: ${lessons.length} chars.`)
  return message + renderLessonsBlock(lessons)
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, patch) => setConfig(patch))
  ipcMain.handle('history:get', () => getHistory())
  ipcMain.handle('history:set', (_e, entries: Entry[]) => { setHistory(entries); return true })
  ipcMain.handle('playbook:get', () => getPlaybook())
  ipcMain.handle('playbook:set', (_e, text: string) => { setPlaybook(text); return true })
  ipcMain.handle('playbook:versions', () => getPlaybookVersions())
  ipcMain.handle('learning:log', () => getLearningLog())
  ipcMain.handle('cli:test', () => { const cfg = getConfig(); return testCli(cfg.cliPath, cfg.generationModel) })
  ipcMain.handle('memory:reset', () => { resetMemory(); return true })
  ipcMain.handle('data:open', () => shell.openPath(dataDir()))
  ipcMain.handle('data:getDir', () => dataDir())
  ipcMain.handle('data:setDir', (_e, dir: string) => setDataDir(dir))
  ipcMain.handle('data:browse', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Choose a data folder (point at a Google Drive folder to sync across devices)',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dataDir(),
    })
    return r.canceled || !r.filePaths[0] ? '' : r.filePaths[0]
  })

  ipcMain.handle('generate', (_e, req: GenerateRequest) => exclusive(async () => {
    const cfg = getConfig()
    const playbook = getPlaybook()
    const history = getHistory()
    const base = { cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: cfg.timeoutMs, onLog: claudeLog }

    const levers = [
      req.resolved.label,
      req.aircraft, `crowd:${req.crowd}`, `env:${req.env}`,
      req.camera && req.camera !== 'auto' ? `cam:${req.camera}` : null,
      req.boost ? 'REACH BOOST' : null,
      req.longPrompt ? 'long-prompt' : null,
      req.hook ? 'hook' : null, req.multiShot ? 'multi-shot' : null,
      `explore:${req.explore}`,
    ].filter(Boolean).join(' · ')
    emitLog('step', `Generating — ${levers}`)
    if (req.remixText && req.remixText.trim()) emitLog('info', 'Remix mode: reworking a proven winner — same ingredients, fresh surface.')
    if (req.nudge && req.nudge.trim()) emitLog('info', `Direction this one: "${req.nudge.trim()}"`)
    emitLog('info', `Playbook attached: ${playbook.length} chars · history: ${history.length} entries`)

    const avoidCombos = req.aircraft !== 'placeholder' ? recentCombos(history, req.resolved.id) : []
    const avoidOverused = req.aircraft !== 'placeholder' ? overusedAircraft(history) : []
    const avoidRecent = req.aircraft !== 'placeholder' ? [...new Set([...recentAnyCombos(history, req.resolved.id), ...avoidOverused])] : []
    // cliff_drop always picks its own structure regardless of the env lever's
    // value (the lever's grass/tarmac/coastal options don't apply to it), so
    // treat it as always-auto for coverage purposes.
    const avoidEnvs = req.varyCoverage && (req.env === 'auto' || req.resolved.id === 'cliff_drop') ? recentEnvs(history, req.resolved.id) : []
    const avoidLines = req.resolved.id === 'ramp_glide' ? recentAnnouncerLines(history) : []
    const trendsData = req.useTrends ? getTrends() : { text: '', updatedAt: '' }
    const trends = trendsData.text
    if (avoidCombos.length) emitLog('info', `Steering clear of ${avoidCombos.length} aircraft that already did well for ${req.resolved.label}.`)
    if (avoidOverused.length) emitLog('info', `Also avoiding ${avoidOverused.length} operator(s) overused across the whole page recently (not just this scenario): ${avoidOverused.join(', ')}.`)
    if (avoidRecent.length) emitLog('info', `Steering clear of ${avoidRecent.length} aircraft used in the last few clips for ${req.resolved.label}.`)
    if (avoidEnvs.length) emitLog('info', `Varying away from ${avoidEnvs.length} recent setting(s) for ${req.resolved.label}.`)
    if (avoidLines.length) emitLog('info', `Steering the announcer away from ${avoidLines.length} line(s) already used.`)
    if (req.useTrends) {
      if (!trends) emitLog('warn', 'Use-trends is on but no digest saved yet — refresh it in Settings.')
      else {
        const ageDays = trendsData.updatedAt ? Math.floor((Date.now() - new Date(trendsData.updatedAt).getTime()) / 86400000) : 0
        if (ageDays >= 7) emitLog('warn', `Trends digest attached but it is ${ageDays} days old — stale trends can hurt more than help. Refresh it in Settings.`)
        else emitLog('info', `Trends digest attached: ${trends.length} chars.`)
      }
    }

    // Some scenarios (e.g. ramp_glide) carry their own, larger character budget
    // because their geometry-matched Negative list cannot fit the default limit;
    // the long-prompt lever lifts it further for platforms that accept ~4800.
    const charLimit = req.longPrompt ? LONG_PROMPT_CHARS : (req.resolved.charBudget || cfg.charLimit)
    const rewriteTarget = req.longPrompt ? LONG_PROMPT_CHARS : (req.resolved.charBudget || cfg.targetMax)

    let text = await callClaude(withRenderLessons(buildUserMessage(req, playbook, cfg.extraNegatives, avoidCombos, avoidEnvs, trends, avoidLines, avoidRecent)), { ...base, system: SYSTEM, label: 'prompt' })
    if (text.length > charLimit) {
      emitLog('warn', `Over limit (${text.length} > ${charLimit}) — asking for a tighter rewrite`)
      text = await callClaude(
        `This prompt is ${text.length} characters, over the ${charLimit} limit. Rewrite under ${rewriteTarget}, keeping all three sections and every required Negative term. Output only the prompt:\n\n${text}`,
        { ...base, system: SYSTEM, label: 'rewrite' },
      )
      if (text.length > charLimit) emitLog('warn', `Still over the limit after the rewrite (${text.length} chars) — trim by hand or regenerate.`)
    }

    let title = ''
    if (cfg.titleEnabled && !req.skipTitle) {
      emitLog('step', 'Writing a title…')
      try {
        title = cleanTitle(
          await callClaude(titleMsg(text, recentTitles(history)), { ...base, system: TITLE_SYSTEM, label: 'title' }),
          cfg.titleMaxLen,
        )
        if (title) emitLog('info', `Title: "${title}"`)
      } catch { emitLog('warn', 'Title step failed — continuing without one.') }
    }

    const filename = toFilename(title || req.resolved.label, req.resolved.filenamePrefix)
    emitLog('ok', 'Prompt ready — added to the queue.')
    return { text, title, filename }
  }))

  // Candidate mode: N distinct prompts from ONE CLI call (separated by =====).
  // Roughly 3x faster and cheaper than three sequential generations, and the
  // model makes the options genuinely different because it writes them together.
  ipcMain.handle('generate:batch', (_e, req: GenerateRequest) => exclusive(async () => {
    const cfg = getConfig()
    const playbook = getPlaybook()
    const history = getHistory()
    const n = Math.min(Math.max(req.candidates || 3, 2), 4)
    const base = { cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: Math.max(cfg.timeoutMs, 240000), onLog: claudeLog }
    emitLog('step', `Generating ${n} candidates in one call — ${req.resolved.label}`)
    const avoidCombos = req.aircraft !== 'placeholder' ? recentCombos(history, req.resolved.id) : []
    const avoidOverused = req.aircraft !== 'placeholder' ? overusedAircraft(history) : []
    const avoidRecent = req.aircraft !== 'placeholder' ? [...new Set([...recentAnyCombos(history, req.resolved.id), ...avoidOverused])] : []
    // cliff_drop always picks its own structure regardless of the env lever's
    // value (the lever's grass/tarmac/coastal options don't apply to it), so
    // treat it as always-auto for coverage purposes.
    const avoidEnvs = req.varyCoverage && (req.env === 'auto' || req.resolved.id === 'cliff_drop') ? recentEnvs(history, req.resolved.id) : []
    const avoidLines = req.resolved.id === 'ramp_glide' ? recentAnnouncerLines(history) : []
    const trends = req.useTrends ? getTrends().text : ''
    const raw = await callClaude(withRenderLessons(buildUserMessage({ ...req, candidates: n }, playbook, cfg.extraNegatives, avoidCombos, avoidEnvs, trends, avoidLines, avoidRecent)), { ...base, system: SYSTEM, label: 'candidates' })
    const batchLimit = req.longPrompt ? LONG_PROMPT_CHARS : (req.resolved.charBudget || cfg.charLimit)
    const variants = parseVariants(raw).slice(0, n)
    for (const v of variants) {
      if (v.length > batchLimit) emitLog('warn', `A candidate is over the limit (${v.length} chars) — pick a different one or regenerate.`)
    }
    emitLog('ok', `${variants.length} candidate prompt(s) ready — pick one.`)
    // Titles are written only for the chosen candidate (renderer side).
    return variants.map((text) => ({ text, title: '', filename: toFilename(req.resolved.label, req.resolved.filenamePrefix) }))
  }))

  // Social caption + hashtags for a finished prompt — on demand from the UI.
  ipcMain.handle('caption', (_e, payload: { text: string; title: string }) => exclusive(async () => {
    const cfg = getConfig()
    emitLog('step', 'Writing a caption + hashtags…')
    const c = (await callClaude(captionMsg(payload.text, payload.title || ''), {
      cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: cfg.timeoutMs, system: CAPTION_SYSTEM, label: 'caption', onLog: claudeLog,
    })).trim()
    if (c) emitLog('ok', 'Caption ready.')
    return c
  }))

  // Extract scene facts (aircraft + environment) from a finished prompt. Called
  // from the renderer only when a clip is scored Good/Viral (and not opted out) —
  // so coverage records what actually worked, not every generation.
  ipcMain.handle('scene:identify', (_e, text: string) => exclusive(async () => {
    const cfg = getConfig()
    emitLog('step', 'Noting the aircraft and setting this one used…')
    try {
      const raw = await callClaude(extractMsg(text), {
        cliPath: cfg.cliPath, model: FAST_MODEL, timeoutMs: cfg.timeoutMs, system: EXTRACT_SYSTEM, label: 'scene', onLog: claudeLog,
      })
      const scene = parseScene(raw)
      if (scene.aircraft || scene.environment) emitLog('info', `Coverage — aircraft: ${scene.aircraft || 'n/a'} · setting: ${scene.environment || 'n/a'}.`)
      else emitLog('warn', 'Nothing identifiable in the prompt — not recorded.')
      return scene
    } catch { emitLog('warn', 'Could not read the scene — not recorded.'); return { aircraft: '', environment: '' } }
  }))

  // Backfill coverage: run the scene extractor over Good/Viral history entries
  // that don't yet have it (e.g. scored before this feature). Returns the updated
  // history for the renderer to adopt. Capped to keep one pass bounded.
  ipcMain.handle('coverage:backfill', () => exclusive(async () => {
    const cfg = getConfig()
    const history = getHistory()
    const targets = history.filter((h) => (h.reach === 'good' || h.reach === 'viral') && !h.excludeCoverage && !(h.pickedEnv && h.pickedEnv.trim())).slice(0, 50)
    if (!targets.length) { emitLog('info', 'Coverage already up to date — nothing to backfill.'); return { history, filled: 0 } }
    emitLog('step', `Backfilling coverage for ${targets.length} scored result(s)…`)
    let filled = 0
    for (const t of targets) {
      try {
        const raw = await callClaude(extractMsg(t.text), {
          cliPath: cfg.cliPath, model: FAST_MODEL, timeoutMs: cfg.timeoutMs, system: EXTRACT_SYSTEM, label: 'backfill', onLog: claudeLog,
        })
        const scene = parseScene(raw)
        if (scene.environment) t.pickedEnv = scene.environment
        if (!t.pickedAircraft && scene.aircraft) t.pickedAircraft = scene.aircraft
        if (scene.environment || scene.aircraft) filled++
      } catch { /* skip this one */ }
    }
    setHistory(history)
    emitLog('ok', `Backfilled coverage for ${filled} of ${targets.length} result(s).`)
    return { history, filled }
  }))

  ipcMain.handle('title', (_e, payload: { text: string; avoid: string[] }) => exclusive(async () => {
    const cfg = getConfig()
    emitLog('step', 'Writing a new title…')
    const t = await callClaude(titleMsg(payload.text, payload.avoid || []), {
      cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: cfg.timeoutMs, system: TITLE_SYSTEM, label: 'title', onLog: claudeLog,
    })
    return cleanTitle(t, cfg.titleMaxLen)
  }))

  ipcMain.handle('learn', (_e, entry: Entry) => exclusive(async () => {
    const cfg = getConfig()
    const before = getPlaybook()
    emitLog('step', `Learning from a "${entry.reach}" result on ${entry.scenario}…`)
    const system = LEARN_SYSTEM.replace('{BUDGET}', String(cfg.playbookBudget))
    let next = await callClaude(buildLearnMessage(before, entry, cfg.playbookBudget, getHistory()), {
      cliPath: cfg.cliPath, model: cfg.learningModel, timeoutMs: cfg.timeoutMs, system, label: 'learn', onLog: claudeLog,
    })
    // Safety net: if the model overshoots the budget, trim at a line/section
    // boundary (never mid-word) so no lesson is left half-written — and surface
    // it, so the loss is never silent. A small overshoot is tolerated as-is.
    if (next.length > cfg.playbookBudget * 1.25) {
      const trimmed = clampPlaybook(next, cfg.playbookBudget)
      emitLog('warn', `Playbook over budget (${next.length} > ${cfg.playbookBudget}) — trimmed to ${trimmed.length} chars at a line boundary. Raise the playbook budget in Settings if lessons are being dropped.`)
      next = trimmed
    }
    setPlaybook(next)
    emitLog('ok', `Playbook updated: ${before.length} → ${next.length} chars.`)
    appendLearningLog({
      ts: new Date().toISOString(),
      reach: entry.reach,
      scenario: entry.scenario,
      before: before.length,
      after: next.length,
    })
    // Drift check: one-at-a-time merges slowly accumulate bias. After enough
    // results since the last full rebuild (reach === null marks a re-distill),
    // nudge the user toward "Re-distill from all history" in Settings.
    const log = getLearningLog()
    let sinceRebuild = 0
    for (let i = log.length - 1; i >= 0; i--) { if (log[i].reach === null) break; sinceRebuild++ }
    if (sinceRebuild >= 15 && sinceRebuild % 5 === 0) {
      emitLog('info', `${sinceRebuild} results folded in since the last full re-distill — consider "Re-distill from all history" in Settings to clear accumulated drift.`)
    }
    return { playbook: next }
  }))

  // Full re-distill: rebuild the whole playbook from scratch over all scored
  // history. Corrects drift/forgetting that one-at-a-time merges accumulate.
  ipcMain.handle('learn:redistill', () => exclusive(async () => {
    const cfg = getConfig()
    const before = getPlaybook()
    const scored = getHistory().filter((h) => h.status === 'scored' && h.reach).slice(0, 100)
    if (!scored.length) {
      emitLog('warn', 'No scored results yet — nothing to re-distill from.')
      return { playbook: before, used: 0 }
    }
    emitLog('step', `Re-distilling the whole playbook from ${scored.length} scored result(s)…`)
    const system = LEARN_SYSTEM.replace('{BUDGET}', String(cfg.playbookBudget))
    let next = await callClaude(buildRedistillMessage(scored, cfg.playbookBudget), {
      cliPath: cfg.cliPath, model: cfg.learningModel, timeoutMs: Math.max(cfg.timeoutMs, 240000), system, label: 'redistill', onLog: claudeLog,
    })
    if (next.length > cfg.playbookBudget * 1.25) {
      const trimmed = clampPlaybook(next, cfg.playbookBudget)
      emitLog('warn', `Rebuilt playbook over budget (${next.length} > ${cfg.playbookBudget}) — trimmed to ${trimmed.length} chars at a line boundary.`)
      next = trimmed
    }
    setPlaybook(next)
    emitLog('ok', `Playbook rebuilt from scratch: ${before.length} → ${next.length} chars (${scored.length} results).`)
    appendLearningLog({ ts: new Date().toISOString(), reach: null, scenario: `full re-distill (${scored.length} results)`, before: before.length, after: next.length })
    return { playbook: next, used: scored.length }
  }))

  // --- Trends: current web-research digest -------------------------------------
  ipcMain.handle('trends:get', () => getTrends())
  ipcMain.handle('trends:set', (_e, text: string) => setTrends(text)) // manual paste fallback
  ipcMain.handle('trends:refresh', () => exclusive(async () => {
    const cfg = getConfig()
    emitLog('step', 'Researching current trends on the web…')
    try {
      const text = await callClaude(trendsMsg(), {
        cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: Math.max(cfg.timeoutMs, 180000),
        system: TREND_SYSTEM, label: 'trends', onLog: claudeLog, allowedTools: ['WebSearch', 'WebFetch'],
      })
      const saved = setTrends(text)
      emitLog('ok', `Trends updated: ${saved.text.length} chars.`)
      return saved
    } catch (e: any) {
      emitLog('err', `Trend research failed (${e?.message || e}). Use the copy-paste fallback in Settings.`)
      throw e
    }
  }))

  // --- AI-invented concepts: "Surprise concept" + a small saved library --------
  ipcMain.handle('concept:suggest', () => exclusive(async () => {
    const cfg = getConfig()
    const playbook = getPlaybook()
    const history = getHistory()
    const saved = getSavedConcepts()
    const trends = getTrends().text
    emitLog('step', 'Inventing a fresh concept…')
    const raw = await callClaude(buildConceptMessage(playbook, triedConceptBriefs(history, saved), trends), {
      cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: cfg.timeoutMs, system: CONCEPT_SYSTEM, label: 'concept', onLog: claudeLog,
    })
    const concept = parseConcept(raw)
    emitLog('ok', `Concept ready: "${concept.label}"`)
    return concept
  }))
  // --- Livery Studio: render pipeline (Dola / Seedance) ---------------------------
  ipcMain.handle('render:overview', () => renderOverview())
  ipcMain.handle('render:submit', (_e, entryIds: number[]) => entryIds.map((id) => renderSubmit(id)))
  ipcMain.handle('render:cancel', (_e, jobId: string) => { renderCancel(jobId); return true })
  ipcMain.handle('render:retry', (_e, payload: { jobId: string; fresh: boolean }) => { renderRetry(payload.jobId, payload.fresh); return true })
  ipcMain.handle('render:remove', (_e, jobId: string) => { renderRemove(jobId); return true })
  ipcMain.handle('render:openFile', (_e, file: string) => shell.openPath(file))
  ipcMain.handle('render:showFile', (_e, file: string) => { shell.showItemInFolder(file); return true })
  ipcMain.handle('render:openOutput', () => {
    const dir = getConfig().render.outputDir
    fs.mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
  })
  ipcMain.handle('render:browseOutput', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Choose where rendered videos are saved', properties: ['openDirectory', 'createDirectory'], defaultPath: getConfig().render.outputDir })
    return r.canceled || !r.filePaths[0] ? '' : r.filePaths[0]
  })
  ipcMain.handle('brain:importLab', () => {
    const r = importFromLiveryLab(true)
    emitLog(r.imported.length ? 'ok' : 'warn', r.imported.length ? `Re-imported from Livery Lab (${r.from}): ${r.imported.join(', ')}` : `Nothing to import from ${r.from}`)
    return r
  })
  ipcMain.handle('brain:labDir', () => liveryLabDataDir())

  // --- Livery Studio: review (Phase 2) -------------------------------------------
  ipcMain.handle('review:decide', (_e, p: { jobId: string; verdict: 'approved' | 'rejected'; reasons: string[]; comment: string }) => reviewDecide(p.jobId, p.verdict, p.reasons, p.comment))
  ipcMain.handle('review:undo', (_e, jobId: string) => reviewUndo(jobId))
  ipcMain.handle('review:rerender', (_e, entryId: number) => rerender(entryId))
  ipcMain.handle('review:rewrite', (_e, entryId: number) => rewriteAndRender(entryId))
  ipcMain.handle('review:unusable', (_e, entryId: number) => { markUnusable(entryId); return true })
  ipcMain.handle('review:stats', () => ({ scenarios: reviewStatsByScenario(), reasons: rejectReasonCounts() }))
  ipcMain.handle('review:lessons:get', () => getRenderLessons())
  ipcMain.handle('review:lessons:set', (_e, text: string) => { setRenderLessons(text); return true })
  ipcMain.handle('history:refresh', () => {
    const r = pullNewFromLab()
    emitLog(r.added ? 'ok' : 'info', r.added ? `Pulled ${r.added} new prompt(s) from Livery Lab.` : 'History refreshed — no new prompts in Livery Lab.')
    return r
  })

  ipcMain.handle('concepts:get', () => getSavedConcepts())
  ipcMain.handle('concepts:save', (_e, payload: { label: string; brief: string; sourceEntryId?: number }) => {
    const saved: SavedConcept = { id: Date.now(), label: payload.label, brief: payload.brief, createdAt: new Date().toISOString(), sourceEntryId: payload.sourceEntryId }
    setSavedConcepts([saved, ...getSavedConcepts()])
    emitLog('ok', `Concept saved: "${saved.label}"`)
    return saved
  })
  ipcMain.handle('concepts:delete', (_e, id: number) => {
    const next = getSavedConcepts().filter((c) => c.id !== id)
    setSavedConcepts(next)
    return next
  })
}

// Allow only one running copy. A second launch focuses the existing window
// instead of opening a rival instance that would fight over the cache lock
// (a white-screen cause) and write to the same Drive data files concurrently.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // Open SQLite; the first time, it imports the old history.json / renders.json.
    const migrated = initStorage()
    // First run: seed the brain (playbook, history, concepts…) from Livery Lab. Copy only.
    const imported = importFromLiveryLab()
    registerMediaProtocol()
    registerIpc()
    createWindow()
    initRenderQueue(emitLog, (jobs) => { if (win && !win.isDestroyed()) win.webContents.send('render:changed', jobs) })
    initReview({
      emitLog,
      claude: (message, o) => exclusive(() => {
        const cfg = getConfig()
        return callClaude(message, { cliPath: cfg.cliPath, model: cfg.generationModel, timeoutMs: Math.max(cfg.timeoutMs, 180000), system: o.system, label: o.label, onLog: claudeLog })
      }),
      historyChanged: () => { if (win && !win.isDestroyed()) win.webContents.send('history:changed') },
    })
    win?.webContents.once('did-finish-load', () => {
      if (migrated && (migrated.entries || migrated.jobs)) emitLog('ok', `Moved storage to SQLite: ${migrated.entries} prompt(s) and ${migrated.jobs} render job(s) imported. The old JSON files are left in place as a backup.`)
      if (imported.imported.length) emitLog('ok', `First run: imported the Livery Lab brain from ${imported.from} (${imported.imported.join(', ')}). The Lab's own files were not touched.`)
    })
    // Dated DB snapshot into the data folder's backups/ shortly after start, then twice a day.
    const snapshot = (): void => { backupStorage().catch((e) => emitLog('warn', `Database backup failed: ${e?.message || e}`)) }
    setTimeout(snapshot, 30_000)
    setInterval(snapshot, 12 * 60 * 60_000).unref?.()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('will-quit', () => closeDb())
}
