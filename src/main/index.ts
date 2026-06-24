import { app, shell, dialog, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { callClaude, testCli } from './claude'
import {
  getConfig, setConfig, getHistory, setHistory, getPlaybook, setPlaybook,
  appendLearningLog, getLearningLog, resetMemory, dataDir, setDataDir,
  getTrends, setTrends,
} from './store'
import { SYSTEM, TITLE_SYSTEM, LEARN_SYSTEM, EXTRACT_SYSTEM, TREND_SYSTEM, buildUserMessage, titleMsg, buildLearnMessage, buildRedistillMessage, extractMsg, parseScene, trendsMsg } from '../shared/prompts'
import { cleanTitle, toFilename, clampPlaybook } from '../shared/util'
import type { GenerateRequest, Entry, LogLevel } from '../shared/types'

let win: BrowserWindow | null = null

// Mechanical airliner-ID extraction is a trivial classification — always run it on
// a fast/cheap model regardless of the (stronger) learning model used for distilling.
const FAST_MODEL = 'claude-haiku-4-5-20251001'

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
    title: 'Livery Lab',
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

// Settings/environments that have done well for one scenario — fed only when the
// user opts in via "Vary using coverage", to push the engine to a fresh setting.
function recentEnvs(history: Entry[], scenarioId: string): string[] {
  const arr = history
    .filter((h) => h.scenarioId === scenarioId && (h.reach === 'good' || h.reach === 'viral')
      && !h.excludeCoverage && h.pickedEnv && h.pickedEnv.trim())
    .map((h) => h.pickedEnv!.trim())
  return [...new Set(arr)].slice(0, COMBO_MEMORY)
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => getConfig())
  ipcMain.handle('config:set', (_e, patch) => setConfig(patch))
  ipcMain.handle('history:get', () => getHistory())
  ipcMain.handle('history:set', (_e, entries: Entry[]) => { setHistory(entries); return true })
  ipcMain.handle('playbook:get', () => getPlaybook())
  ipcMain.handle('playbook:set', (_e, text: string) => { setPlaybook(text); return true })
  ipcMain.handle('learning:log', () => getLearningLog())
  ipcMain.handle('cli:test', () => testCli(getConfig().cliPath))
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
      req.hook ? 'hook' : null, req.multiShot ? 'multi-shot' : null,
      `explore:${req.explore}`,
    ].filter(Boolean).join(' · ')
    emitLog('step', `Generating — ${levers}`)
    if (req.nudge && req.nudge.trim()) emitLog('info', `Direction this one: "${req.nudge.trim()}"`)
    emitLog('info', `Playbook attached: ${playbook.length} chars · history: ${history.length} entries`)

    const avoidCombos = req.aircraft !== 'placeholder' ? recentCombos(history, req.resolved.id) : []
    const avoidEnvs = req.varyCoverage && req.env === 'auto' ? recentEnvs(history, req.resolved.id) : []
    const trends = req.useTrends ? getTrends().text : ''
    if (avoidCombos.length) emitLog('info', `Steering clear of ${avoidCombos.length} aircraft that already did well for ${req.resolved.label}.`)
    if (avoidEnvs.length) emitLog('info', `Varying away from ${avoidEnvs.length} recent setting(s) for ${req.resolved.label}.`)
    if (req.useTrends) emitLog('info', trends ? `Trends digest attached: ${trends.length} chars.` : 'Use-trends is on but no digest saved yet — refresh it in Settings.')

    let text = await callClaude(buildUserMessage(req, playbook, cfg.extraNegatives, avoidCombos, avoidEnvs, trends), { ...base, system: SYSTEM, label: 'prompt' })
    if (text.length > cfg.charLimit) {
      emitLog('warn', `Over limit (${text.length} > ${cfg.charLimit}) — asking for a tighter rewrite`)
      text = await callClaude(
        `This prompt is ${text.length} characters, over the ${cfg.charLimit} limit. Rewrite under ${cfg.targetMax}, keeping all three sections and every required Negative term. Output only the prompt:\n\n${text}`,
        { ...base, system: SYSTEM, label: 'rewrite' },
      )
    }

    let title = ''
    if (cfg.titleEnabled) {
      emitLog('step', 'Writing a title…')
      try {
        title = cleanTitle(
          await callClaude(titleMsg(text, recentTitles(history)), { ...base, system: TITLE_SYSTEM, label: 'title' }),
          cfg.titleMaxLen,
        )
        if (title) emitLog('info', `Title: "${title}"`)
      } catch { emitLog('warn', 'Title step failed — continuing without one.') }
    }

    const filename = toFilename(title || req.resolved.label)
    emitLog('ok', 'Prompt ready — added to the queue.')
    return { text, title, filename }
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
    let next = await callClaude(buildLearnMessage(before, entry, cfg.playbookBudget), {
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
        cliPath: cfg.cliPath, model: 'claude-sonnet-4-6', timeoutMs: Math.max(cfg.timeoutMs, 180000),
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
    registerIpc()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
