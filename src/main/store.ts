import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig, Entry, LearningLogEntry } from '../shared/types'

// Per-device bootstrap pointer (always in this machine's userData). It records
// WHERE the actual data lives, so each Windows device can independently point at
// one shared Google Drive folder and have the playbook + history follow it.
const LOCATION_FILE = path.join(app.getPath('userData'), 'location.json')

export const DEFAULT_CONFIG: AppConfig = {
  cliPath: '',
  generationModel: 'claude-sonnet-4-6',
  // The distill/re-distill pass does the hardest reasoning (causal attribution),
  // so it defaults to the strongest model. The cheap, mechanical airliner-ID call
  // does NOT use this — it runs on a fixed fast model (see FAST_MODEL in main).
  learningModel: 'claude-opus-4-8',
  timeoutMs: 120000,
  charLimit: 1500,
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
    explore: 45,
    hook: false,
    multiShot: false,
  },
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

const FILES = ['config.json', 'history.json', 'playbook.md', 'learning-log.jsonl', 'trends.json']

/** Point the app at a new data folder; copy existing files over if the target lacks them. */
export function setDataDir(dir: string): { ok: boolean; message: string; dir: string } {
  const target = dir.trim()
  if (!target) {
    writeJson(LOCATION_FILE, {})
    return { ok: true, message: 'Reset to this device’s default folder.', dir: dataDir() }
  }
  try {
    fs.mkdirSync(target, { recursive: true })
    const probe = path.join(target, '.liverylab-write-test')
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

const p = (f: string) => path.join(dataDir(), f)

// --- Config --------------------------------------------------------------------

export function getConfig(): AppConfig {
  const stored = readJson<Partial<AppConfig>>(p('config.json'), {})
  return { ...DEFAULT_CONFIG, ...stored, defaults: { ...DEFAULT_CONFIG.defaults, ...(stored.defaults || {}) } }
}

export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const cur = getConfig()
  const next = { ...cur, ...patch }
  if (patch.defaults) next.defaults = { ...cur.defaults, ...patch.defaults }
  writeJson(p('config.json'), next)
  return next
}

// --- History / playbook / log --------------------------------------------------

export function getHistory(): Entry[] {
  // History is the user's irreplaceable learning record — recover from the
  // backup if the live file was lost or corrupted (e.g. a Drive sync conflict).
  return readJsonRecoverable<Entry[]>(p('history.json'), (v) => Array.isArray(v), [])
}

export function setHistory(entries: Entry[]): void {
  const file = p('history.json')
  backup(file)
  writeJson(file, entries.slice(0, 500))
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
  backup(file)
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, text, 'utf8')
    fs.renameSync(tmp, file)
  } catch {
    fs.writeFileSync(file, text, 'utf8')
  }
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

export function getTrends(): { text: string; updatedAt: string } {
  return readJson(p('trends.json'), { text: '', updatedAt: '' })
}

export function setTrends(text: string): { text: string; updatedAt: string } {
  const v = { text: text.trim(), updatedAt: new Date().toISOString() }
  writeJson(p('trends.json'), v)
  return v
}

export function resetMemory(): void {
  for (const f of ['history.json', 'playbook.md', 'learning-log.jsonl']) {
    try { const fp = p(f); if (fs.existsSync(fp)) fs.unlinkSync(fp) } catch { /* ignore */ }
  }
}
