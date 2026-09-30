import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig, Entry, LearningLogEntry, RenderJob, RenderSettings, ReviewSettings, NotifySettings, AiSettings, SavedConcept } from '../shared/types'
import {
  getDb, migrateFromJson, backupDb, loadEntries, getEntry, upsertEntries, countEntries, clearEntries,
  loadRenderJobs, syncRenderJobs,
} from './db'
import { REVIEW_DEFAULTS } from '../shared/review'
import { REFERENCE_IMAGE1_DEFAULT } from '../shared/references'

// Per-device bootstrap pointer (always in this machine's userData). It records
// WHERE the actual data lives, so each Windows device can independently point at
// one shared Google Drive folder and have the playbook + history follow it.
const LOCATION_FILE = path.join(app.getPath('userData'), 'location.json')

export const DEFAULT_RENDER: RenderSettings = {
  dailyCap: 15,
  maxParallel: 0,
  excludeInstances: [5],
  outputDir: path.join(app.getPath('videos'), 'Livery Studio'),
  model: 'Seedance 2.5',
  duration: '15 Sec',
  aspect: '9:16 vertical',
  extraInstructions: '',
  referenceImages: true,
  referenceImage1: REFERENCE_IMAGE1_DEFAULT,
  referenceImage2: {},
  waitMinutes: 25,
  autoStartInstances: true,
  autoRender: false,
  pauseAfterFailures: 3,
  creditResetHour: 0,
}

export const DEFAULT_REVIEW: ReviewSettings = REVIEW_DEFAULTS // shared so the renderer can fill gaps too

// Defaults keep the pre-MiniMax behaviour: titles/captions on the generation model,
// coverage + reference naming on Haiku; MiniMax and the pre-check off until switched on.
export const DEFAULT_AI: AiSettings = {
  minimax: { enabled: false, cliPath: '', dailyTokenLimit: 500000 },
  routes: { title: 'claude:generation', caption: 'claude:generation', scene: 'claude:claude-haiku-4-5', refAircraft: 'claude:claude-haiku-4-5' },
  precheck: { enabled: false, model: 'MiniMax-M3', auto: true },
}

export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  onlyWhenUnfocused: true,
  renderDone: true,
  renderFailed: true,
  capReached: true,
  queuePaused: true,
  autoRetry: false,
  creditsOut: true,
}

export const DEFAULT_CONFIG: AppConfig = {
  cliPath: '',
  generationModel: 'claude-sonnet-5',
  // The distill/re-distill pass does the hardest reasoning (causal attribution),
  // so it defaults to the strongest model. The cheap, mechanical airliner-ID call
  // does NOT use this — it runs on a fixed fast model (see FAST_MODEL in main).
  learningModel: 'claude-opus-4-8',
  timeoutMs: 120000,
  charLimit: 1500,
  longPromptChars: 4800,
  targetMin: 1400,
  targetMax: 1490,
  playbookBudget: 2500,
  autoLearn: true,
  titleEnabled: true,
  titleMaxLen: 70,
  extraNegatives: '',
  defaults: {
    scenario: 'random',
    aircraft: 'placeholder',
    crowd: 'busy',
    env: 'auto',
    camera: 'auto',
    explore: 45,
    hook: false,
    multiShot: false,
    longPrompt: true,
  },
  render: DEFAULT_RENDER,
  review: DEFAULT_REVIEW,
  notify: DEFAULT_NOTIFY,
  ai: DEFAULT_AI,
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/**
 * Write atomically: serialise to a temp file in the same folder, then rename
 * over the target. A crash or a mid-write Google Drive sync can no longer
 * leave a half-written, corrupt file — the rename either fully happens or not.
 * Falls back to a direct write if the volume rejects rename (rare).
 */
function writeJson(file: string, value: unknown): void {
  const data = JSON.stringify(value, null, 2)
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, data, 'utf8')
    fs.renameSync(tmp, file)
  } catch {
    fs.writeFileSync(file, data, 'utf8')
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}

/** Keep a .bak copy of the last known-good file before overwriting it. */
function backup(file: string): void {
  try { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`) } catch { /* non-critical */ }
}

/** Read JSON, transparently recovering from a backup if the main file is missing or corrupt. */
function readJsonRecoverable<T>(file: string, isValid: (v: unknown) => boolean, fallback: T): T {
  const main = readJson<unknown>(file, null)
  if (isValid(main)) return main as T
  const bak = readJson<unknown>(`${file}.bak`, null)
  return isValid(bak) ? (bak as T) : fallback
}

// --- Data directory resolution -------------------------------------------------

export function dataDir(): string {
  const loc = readJson<{ dataDir?: string }>(LOCATION_FILE, {})
  if (loc.dataDir && loc.dataDir.trim()) {
    try {
      fs.mkdirSync(loc.dataDir, { recursive: true })
      return loc.dataDir
    } catch {
      /* fall back to default if the configured path is unreachable (e.g. Drive offline) */
    }
  }
  return app.getPath('userData')
}

// Small documents kept as files in the data folder. History and render jobs live in
// SQLite (db.ts) in this machine's userData; backups/ holds dated DB snapshots.
const FILES = ['config.json', 'playbook.md', 'playbook-versions.json', 'learning-log.jsonl', 'trends.json', 'concepts.json', 'render-lessons.md']

/** Point the app at a new data folder; copy existing files over if the target lacks them. */
export function setDataDir(dir: string): { ok: boolean; message: string; dir: string } {
  const target = dir.trim()
  if (!target) {
    writeJson(LOCATION_FILE, {})
    return { ok: true, message: 'Reset to this device’s default folder.', dir: dataDir() }
  }
  // Guard: sharing Livery Lab's data folder would let both apps overwrite each other's brain.
  if (path.resolve(target).toLowerCase() === path.resolve(liveryLabDataDir()).toLowerCase()) {
    return { ok: false, message: 'That is Livery Lab’s data folder — pick a separate folder for Livery Studio.', dir: dataDir() }
  }
  try {
    fs.mkdirSync(target, { recursive: true })
    const probe = path.join(target, '.liverystudio-write-test')
    fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe)
  } catch (e: any) {
    return { ok: false, message: `Cannot write to that folder: ${e?.message || e}`, dir: dataDir() }
  }
  // Migrate existing files if the new location is empty of them.
  const from = dataDir()
  if (path.resolve(from) !== path.resolve(target)) {
    for (const f of FILES) {
      const src = path.join(from, f)
      const dst = path.join(target, f)
      try { if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst) } catch { /* ignore */ }
    }
  }
  writeJson(LOCATION_FILE, { dataDir: target })
  return { ok: true, message: 'Data folder set. Your history and playbook now live here.', dir: target }
}

// --- One-way brain import from Livery Lab ---------------------------------------
// Livery Studio is a fork of Livery Lab with its own userData, so on first run it
// starts empty. Seed it from the Lab's data folder (wherever the Lab's own
// location.json points, e.g. the Google Drive memory folder). Copy only — the
// Lab's files are never written, so the Lab keeps working untouched beside us.
export function liveryLabDataDir(): string {
  const labUserData = path.join(app.getPath('appData'), 'livery-lab')
  const loc = readJson<{ dataDir?: string }>(path.join(labUserData, 'location.json'), {})
  return loc.dataDir && loc.dataDir.trim() ? loc.dataDir : labUserData
}

function readLabHistory(): Entry[] {
  return readJsonRecoverable<Entry[]>(path.join(liveryLabDataDir(), 'history.json'), (v) => Array.isArray(v), [])
}

/**
 * Copy the Lab's brain documents into the Studio's data folder and load the Lab's
 * history into the database. First run: only when the Studio has no brain yet.
 * force (Settings → Re-import): Lab copies overwrite matching entries, but prompts
 * created in the Studio are kept (render jobs point at them).
 */
export function importFromLiveryLab(force = false): { imported: string[]; from: string } {
  const from = liveryLabDataDir()
  const to = dataDir()
  const imported: string[] = []
  if (path.resolve(from) === path.resolve(to)) return { imported, from }
  const hasBrain = countEntries() > 0 || fs.existsSync(path.join(to, 'playbook.md'))
  if (hasBrain && !force) return { imported, from }
  for (const f of FILES) {
    const src = path.join(from, f)
    const dst = path.join(to, f)
    try {
      if (!fs.existsSync(src)) continue
      if (fs.existsSync(dst)) backup(dst)
      fs.copyFileSync(src, dst)
      imported.push(f)
    } catch { /* skip unreadable file (e.g. Drive offline) */ }
  }
  const labHistory = readLabHistory()
  if (labHistory.length) { upsertEntries(labHistory); imported.push(`history (${labHistory.length} prompts)`) }
  return { imported, from }
}

const p = (f: string) => path.join(dataDir(), f)

/**
 * Open the database and, the first time, import the JSON history/render files the
 * app used before SQLite (from the data folder). Call once at startup, before
 * anything reads history.
 */
export function initStorage(): { entries: number; jobs: number } | null {
  getDb()
  return migrateFromJson(dataDir())
}

/** Snapshot the DB into <data folder>/backups (daily, last 7 kept). */
export function backupStorage(): Promise<string | null> {
  return backupDb(dataDir())
}

// --- Render jobs (main-process owned, SQLite) ------------------------------------

export function getRenderJobs(): RenderJob[] {
  return loadRenderJobs()
}

export function setRenderJobs(jobs: RenderJob[]): void {
  syncRenderJobs(jobs)
}

// --- Config --------------------------------------------------------------------

export function getConfig(): AppConfig {
  const stored = readJson<Partial<AppConfig>>(p('config.json'), {})
  return {
    ...DEFAULT_CONFIG, ...stored,
    defaults: { ...DEFAULT_CONFIG.defaults, ...(stored.defaults || {}) },
    render: { ...DEFAULT_RENDER, ...(stored.render || {}) },
    review: { ...DEFAULT_REVIEW, ...(stored.review || {}) },
    notify: { ...DEFAULT_NOTIFY, ...(stored.notify || {}) },
    ai: {
      minimax: { ...DEFAULT_AI.minimax, ...(stored.ai?.minimax || {}) },
      routes: { ...DEFAULT_AI.routes, ...(stored.ai?.routes || {}) },
      precheck: { ...DEFAULT_AI.precheck, ...(stored.ai?.precheck || {}) },
    },
  }
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const cur = getConfig()
  const next = { ...cur, ...patch }
  if (patch.defaults) next.defaults = { ...cur.defaults, ...patch.defaults }
  if (patch.render) next.render = { ...cur.render, ...patch.render }
  if (patch.review) next.review = { ...cur.review, ...patch.review }
  if (patch.notify) next.notify = { ...cur.notify, ...patch.notify }
  if (patch.ai) next.ai = {
    minimax: { ...cur.ai.minimax, ...(patch.ai.minimax || {}) },
    routes: { ...cur.ai.routes, ...(patch.ai.routes || {}) },
    precheck: { ...cur.ai.precheck, ...(patch.ai.precheck || {}) },
  }
  writeJson(p('config.json'), next)
  return next
}

// --- History / playbook / log --------------------------------------------------

// History lives in SQLite (db.ts), newest first, uncapped. The brain still sees a
// plain Entry[] exactly as before.
export function getHistory(): Entry[] {
  return loadEntries()
}

/**
 * Pull prompts created in Livery Lab since the import: any Lab entry whose id the
 * Studio doesn't have is added. Append-only — Studio entries are never replaced
 * (they may have been scored differently here) and the Lab's file is only read.
 */
export function pullNewFromLab(): { history: Entry[]; added: number } {
  const lab = readLabHistory()
  const fresh = lab.filter((h) => h && typeof h.id === 'number' && !getEntry(h.id))
  if (fresh.length) upsertEntries(fresh)
  return { history: getHistory(), added: fresh.length }
}

/** Save entries (insert or update; unchanged rows are skipped). Never deletes — reset uses resetMemory. */
export function setHistory(entries: Entry[]): void {
  upsertEntries(entries)
}

export function getPlaybook(): string {
  try {
    const f = p('playbook.md')
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
    const bak = `${f}.bak`
    return fs.existsSync(bak) ? fs.readFileSync(bak, 'utf8') : ''
  } catch {
    return ''
  }
}

export function setPlaybook(text: string): void {
  const file = p('playbook.md')
  savePlaybookVersion()
  backup(file)
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, text, 'utf8')
    fs.renameSync(tmp, file)
  } catch {
    fs.writeFileSync(file, text, 'utf8')
  }
}

// --- Playbook version history: every overwrite snapshots the outgoing playbook
// (last 10 kept), so a bad learn can be rolled back from Settings instead of
// being lost forever.
const PLAYBOOK_VERSIONS_MAX = 10

export interface PlaybookVersion { ts: string; text: string }

export function getPlaybookVersions(): PlaybookVersion[] {
  return readJson<PlaybookVersion[]>(p('playbook-versions.json'), [])
}

function savePlaybookVersion(): void {
  try {
    const current = getPlaybook()
    if (!current.trim()) return
    const versions = getPlaybookVersions()
    if (versions.length && versions[0].text === current) return
    versions.unshift({ ts: new Date().toISOString(), text: current })
    writeJson(p('playbook-versions.json'), versions.slice(0, PLAYBOOK_VERSIONS_MAX))
  } catch { /* non-critical */ }
}

export function appendLearningLog(entry: LearningLogEntry): void {
  try { fs.appendFileSync(p('learning-log.jsonl'), JSON.stringify(entry) + '\n', 'utf8') } catch { /* non-critical */ }
}

export function getLearningLog(): LearningLogEntry[] {
  try {
    const f = p('learning-log.jsonl')
    if (!fs.existsSync(f)) return []
    return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean) as LearningLogEntry[]
  } catch {
    return []
  }
}

// --- Trends (current web-research digest, opt-in for generation) ----------------

// --- Render lessons (learned from rejected renders; Livery Studio Phase 2) ------

export function getRenderLessons(): string {
  try { const f = p('render-lessons.md'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' } catch { return '' }
}

export function setRenderLessons(text: string): void {
  const file = p('render-lessons.md')
  backup(file)
  fs.writeFileSync(file, text, 'utf8')
}

export function getTrends(): { text: string; updatedAt: string } {
  return readJson(p('trends.json'), { text: '', updatedAt: '' })
}

export function setTrends(text: string): { text: string; updatedAt: string } {
  const v = { text: text.trim(), updatedAt: new Date().toISOString() }
  writeJson(p('trends.json'), v)
  return v
}

// --- Saved concepts (user-curated library of AI-invented formats) --------------
// Deliberately NOT wiped by resetMemory() below — these are things the user
// explicitly chose to keep, not accumulated learning drift.

export function getSavedConcepts(): SavedConcept[] {
  return readJson<SavedConcept[]>(p('concepts.json'), [])
}

export function setSavedConcepts(list: SavedConcept[]): void {
  writeJson(p('concepts.json'), list)
}

export function resetMemory(): void {
  for (const f of ['playbook.md', 'playbook-versions.json', 'learning-log.jsonl']) {
    try { const fp = p(f); if (fs.existsSync(fp)) fs.unlinkSync(fp) } catch { /* ignore */ }
  }
  // Render jobs are kept: they point at real video files on disk.
  clearEntries()
}
