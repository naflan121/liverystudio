// SQLite storage for the data that grows: prompt history (entries) and render jobs,
// and later reviews, schedules, posts and view metrics. Small hand-editable
// documents (config.json, playbook.md, trends, concepts, learning log) stay as files.
//
// Rows keep the full object as JSON in `data` (so the brain's Entry shape can keep
// evolving without migrations) plus a few indexed columns for queries.
//
// The database always lives in this machine's userData, never in a synced data
// folder: Google Drive syncing a live SQLite/WAL file corrupts it. Instead, dated
// snapshots are written into the data folder's backups/ (see backupDb).

import { app } from 'electron'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { Entry, RenderJob } from '../shared/types'

let db: Database.Database | null = null

const MIGRATIONS: string[] = [
  // v1 — entries + render jobs + meta
  `CREATE TABLE entries (
     id INTEGER PRIMARY KEY,
     ts TEXT NOT NULL,
     status TEXT NOT NULL,
     reach TEXT,
     scenario_id TEXT,
     data TEXT NOT NULL
   );
   CREATE INDEX entries_status ON entries(status);
   CREATE INDEX entries_scenario ON entries(scenario_id);
   CREATE TABLE render_jobs (
     id TEXT PRIMARY KEY,
     entry_id INTEGER NOT NULL,
     status TEXT NOT NULL,
     created_at TEXT NOT NULL,
     sent_at TEXT,
     data TEXT NOT NULL
   );
   CREATE INDEX render_jobs_entry ON render_jobs(entry_id);
   CREATE INDEX render_jobs_sent ON render_jobs(sent_at);
   CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2 — review decisions (append-only log; an undo stamps undone_at instead of deleting)
  `CREATE TABLE reviews (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     job_id TEXT NOT NULL,
     entry_id INTEGER NOT NULL,
     verdict TEXT NOT NULL,
     reasons TEXT NOT NULL DEFAULT '[]',
     comment TEXT NOT NULL DEFAULT '',
     scenario_id TEXT,
     instance TEXT,
     reviewed_at TEXT NOT NULL,
     undone_at TEXT
   );
   CREATE INDEX reviews_job ON reviews(job_id);
   CREATE INDEX reviews_entry ON reviews(entry_id);`,
]

export function dbPath(): string {
  return path.join(app.getPath('userData'), 'studio.db')
}

export function getDb(): Database.Database {
  if (db) return db
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  const version = db.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db!.exec(MIGRATIONS[v])
      db!.pragma(`user_version = ${v + 1}`)
    })()
  }
  return db
}

export function getMeta(key: string): string | undefined {
  return (getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value
}

export function setMeta(key: string, value: string): void {
  getDb().prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

// --- entries (prompt history) ---------------------------------------------------

export function countEntries(): number {
  return (getDb().prepare('SELECT COUNT(*) n FROM entries').get() as { n: number }).n
}

/** All entries, newest first (entry ids are Date.now() timestamps). */
export function loadEntries(): Entry[] {
  return (getDb().prepare('SELECT data FROM entries ORDER BY id DESC').all() as { data: string }[]).map((r) => JSON.parse(r.data))
}

export function getEntry(id: number): Entry | undefined {
  const r = getDb().prepare('SELECT data FROM entries WHERE id = ?').get(id) as { data: string } | undefined
  return r ? JSON.parse(r.data) : undefined
}

/** Insert or update entries; rows whose JSON is unchanged are skipped. Never deletes. Returns rows written. */
export function upsertEntries(entries: Entry[]): number {
  const d = getDb()
  const existing = d.prepare('SELECT data FROM entries WHERE id = ?')
  const write = d.prepare(`INSERT INTO entries (id, ts, status, reach, scenario_id, data) VALUES (@id, @ts, @status, @reach, @scenario_id, @data)
    ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, status = excluded.status, reach = excluded.reach, scenario_id = excluded.scenario_id, data = excluded.data`)
  let n = 0
  d.transaction(() => {
    for (const e of entries) {
      if (!e || typeof e.id !== 'number') continue
      const data = JSON.stringify(e)
      const cur = existing.get(e.id) as { data: string } | undefined
      if (cur && cur.data === data) continue
      write.run({ id: e.id, ts: e.ts || new Date(e.id).toISOString(), status: e.status || 'queued', reach: e.reach ?? null, scenario_id: e.scenarioId ?? null, data })
      n++
    }
  })()
  return n
}

export function replaceEntries(entries: Entry[]): void {
  const d = getDb()
  d.transaction(() => {
    d.prepare('DELETE FROM entries').run()
    upsertEntries(entries)
  })()
}

export function clearEntries(): void {
  getDb().prepare('DELETE FROM entries').run()
}

// --- render jobs ----------------------------------------------------------------

export function loadRenderJobs(): RenderJob[] {
  return (getDb().prepare('SELECT data FROM render_jobs ORDER BY created_at DESC, rowid DESC').all() as { data: string }[]).map((r) => JSON.parse(r.data))
}

/** Make the table match `jobs` (the render queue's in-memory list is authoritative). Unchanged rows are skipped. */
export function syncRenderJobs(jobs: RenderJob[]): void {
  const d = getDb()
  const existing = new Map((d.prepare('SELECT id, data FROM render_jobs').all() as { id: string; data: string }[]).map((r) => [r.id, r.data]))
  const write = d.prepare(`INSERT INTO render_jobs (id, entry_id, status, created_at, sent_at, data) VALUES (@id, @entry_id, @status, @created_at, @sent_at, @data)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, sent_at = excluded.sent_at, data = excluded.data`)
  const del = d.prepare('DELETE FROM render_jobs WHERE id = ?')
  d.transaction(() => {
    const keep = new Set<string>()
    for (const j of jobs) {
      keep.add(j.id)
      const data = JSON.stringify(j)
      if (existing.get(j.id) === data) continue
      write.run({ id: j.id, entry_id: j.entryId, status: j.status, created_at: j.createdAt, sent_at: j.sentAt ?? null, data })
    }
    for (const id of existing.keys()) if (!keep.has(id)) del.run(id)
  })()
}

// --- reviews ----------------------------------------------------------------------

export function insertReview(r: { jobId: string; entryId: number; verdict: string; reasons: string[]; comment: string; scenarioId?: string; instance?: string; at: string }): void {
  getDb().prepare(`INSERT INTO reviews (job_id, entry_id, verdict, reasons, comment, scenario_id, instance, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(r.jobId, r.entryId, r.verdict, JSON.stringify(r.reasons), r.comment, r.scenarioId ?? null, r.instance ?? null, r.at)
}

/** Mark the job's latest live review as undone. */
export function undoLatestReview(jobId: string, at: string): void {
  getDb().prepare(`UPDATE reviews SET undone_at = ? WHERE id = (SELECT id FROM reviews WHERE job_id = ? AND undone_at IS NULL ORDER BY id DESC LIMIT 1)`).run(at, jobId)
}

export interface ReviewStatRow { scenario: string; approved: number; rejected: number }

/** Live (not undone) verdict counts per scenario — the render reliability of each format. */
export function reviewStatsByScenario(): ReviewStatRow[] {
  return getDb().prepare(`SELECT COALESCE(scenario_id, '?') scenario,
      SUM(verdict = 'approved') approved, SUM(verdict = 'rejected') rejected
    FROM reviews WHERE undone_at IS NULL GROUP BY scenario ORDER BY rejected DESC`).all() as ReviewStatRow[]
}

/** Live reason counts across all rejections. */
export function rejectReasonCounts(): { reason: string; n: number }[] {
  return getDb().prepare(`SELECT j.value reason, COUNT(*) n FROM reviews, json_each(reviews.reasons) j
    WHERE verdict = 'rejected' AND undone_at IS NULL GROUP BY j.value ORDER BY n DESC`).all() as { reason: string; n: number }[]
}

// --- one-time import of the JSON files this app used before SQLite ---------------

/** Import history.json / renders.json from the data folder the first time the DB is opened. */
export function migrateFromJson(dataDir: string): { entries: number; jobs: number } | null {
  if (getMeta('json_migrated')) return null
  const readArr = (file: string): any[] => {
    try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v : [] } catch { return [] }
  }
  // Union of the file and its .bak by id (the main file wins). The old whole-file
  // saves could drop rows (e.g. a re-import overwrote history.json while the only
  // copy of a Studio-made prompt sat in .bak) — this recovers them.
  const read = <T extends { id: unknown }>(f: string): T[] => {
    const byId = new Map<unknown, T>()
    for (const row of readArr(path.join(dataDir, `${f}.bak`))) if (row && row.id != null) byId.set(row.id, row)
    for (const row of readArr(path.join(dataDir, f))) if (row && row.id != null) byId.set(row.id, row)
    return [...byId.values()]
  }
  const entries = read<Entry>('history.json')
  const jobs = read<RenderJob>('renders.json')
  getDb().transaction(() => {
    if (entries.length && countEntries() === 0) upsertEntries(entries)
    if (jobs.length && loadRenderJobs().length === 0) syncRenderJobs(jobs)
    setMeta('json_migrated', new Date().toISOString())
  })()
  return { entries: entries.length, jobs: jobs.length }
}

// --- backups ----------------------------------------------------------------------

const KEEP_BACKUPS = 7

/** Snapshot the live DB into <dir>/backups/studio-YYYY-MM-DD.db (one per day, last 7 kept). */
export async function backupDb(dir: string): Promise<string | null> {
  const folder = path.join(dir, 'backups')
  fs.mkdirSync(folder, { recursive: true })
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const target = path.join(folder, `studio-${day}.db`)
  // Write to a temp name then rename, so a synced folder never sees a half-written file.
  const tmp = `${target}.tmp`
  await getDb().backup(tmp)
  fs.renameSync(tmp, target)
  const old = fs.readdirSync(folder).filter((f) => /^studio-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(KEEP_BACKUPS)
  for (const f of old) { try { fs.unlinkSync(path.join(folder, f)) } catch { /* ignore */ } }
  return target
}

export function closeDb(): void {
  try { db?.close() } catch { /* ignore */ }
  db = null
}
