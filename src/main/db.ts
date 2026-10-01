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
import type { Entry, RenderJob, UsageRow, Provider } from '../shared/types'

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
  // v3 — one row per Claude CLI call (the CLI reports API-equivalent cost + tokens)
  `CREATE TABLE usage (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL,
     day TEXT NOT NULL,
     label TEXT NOT NULL,
     model TEXT NOT NULL,
     ok INTEGER NOT NULL,
     cost_usd REAL NOT NULL DEFAULT 0,
     input_tokens INTEGER NOT NULL DEFAULT 0,
     output_tokens INTEGER NOT NULL DEFAULT 0,
     cache_read_tokens INTEGER NOT NULL DEFAULT 0,
     cache_write_tokens INTEGER NOT NULL DEFAULT 0,
     duration_ms INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX usage_day ON usage(day);`,
  // v4 — which engine a call ran on; the AI pre-check verdict at the time you decided (agreement tracking)
  `ALTER TABLE usage ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude';
   ALTER TABLE reviews ADD COLUMN precheck TEXT;`,
  // v5 — render lessons: each rejection-derived rule is one row, so it's auditable
  // (source job + reasons), operator-approvable, dismissable, and the renderer can
  // bump usage stats when a reviewer confirms a rule matched their rejection.
  `CREATE TABLE render_lessons (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     created_at TEXT NOT NULL,
     source_job_id TEXT,
     source_reasons TEXT NOT NULL DEFAULT '[]',
     source_comment TEXT,
     rule TEXT NOT NULL,
     category TEXT,
     confidence TEXT NOT NULL DEFAULT 'low',
     status TEXT NOT NULL DEFAULT 'pending',
     uses INTEGER NOT NULL DEFAULT 0,
     matched_uses INTEGER NOT NULL DEFAULT 0,
     last_used_at TEXT,
     dismissed_at TEXT,
     dismiss_reason TEXT,
     superseded_by INTEGER,
     imported_from TEXT
   );
   CREATE INDEX render_lessons_status ON render_lessons(status);
   CREATE INDEX render_lessons_confidence ON render_lessons(confidence);
   CREATE INDEX render_lessons_superseded ON render_lessons(superseded_by);`,
  // v6 — scene-level failure tracking: when the reviewer writes e.g. "rolled inverted
  // at 0:06", the regex parse extracts 6.0s into failed_at_seconds so the brain agent
  // can cluster rejections by (reason, scenario, ~moment) and spot persistent
  // failure points that span many clips.
  `ALTER TABLE reviews ADD COLUMN failed_at_seconds REAL;`,
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

export function insertReview(r: { jobId: string; entryId: number; verdict: string; reasons: string[]; comment: string; scenarioId?: string; instance?: string; at: string; precheck?: string; failedAtSeconds?: number | null }): void {
  getDb().prepare(`INSERT INTO reviews (job_id, entry_id, verdict, reasons, comment, scenario_id, instance, reviewed_at, precheck, failed_at_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.jobId, r.entryId, r.verdict, JSON.stringify(r.reasons), r.comment, r.scenarioId ?? null, r.instance ?? null, r.at, r.precheck ?? null, r.failedAtSeconds ?? null)
}

/** How often the AI pre-check matched your approve/reject (live decisions only). */
export function precheckAgreement(): { compared: number; agreed: number; falseRejects: number; missedRejects: number } {
  const row = getDb().prepare(`SELECT COUNT(*) compared,
      SUM((precheck = 'approve' AND verdict = 'approved') OR (precheck = 'reject' AND verdict = 'rejected')) agreed,
      SUM(precheck = 'reject' AND verdict = 'approved') falseRejects,
      SUM(precheck = 'approve' AND verdict = 'rejected') missedRejects
    FROM reviews WHERE undone_at IS NULL AND precheck IS NOT NULL AND verdict IN ('approved', 'rejected')`).get() as any
  return { compared: row.compared || 0, agreed: row.agreed || 0, falseRejects: row.falseRejects || 0, missedRejects: row.missedRejects || 0 }
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

/** Rejections with a parsed failed_at_seconds — for the brain agent's per-moment clustering.
 *  Bounded to the last `limit` rejections so we don't pull the entire reviews table. */
export function recentRejectionsWithMoment(opts: { limit?: number } = {}): { jobId: string; entryId: number; scenarioId: string | null; reasons: string[]; failedAtSeconds: number | null; comment: string; at: string }[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200))
  const rows = getDb().prepare(`SELECT job_id, entry_id, scenario_id, reasons, failed_at_seconds, comment, reviewed_at
    FROM reviews WHERE verdict = 'rejected' AND undone_at IS NULL
    ORDER BY reviewed_at DESC LIMIT ?`).all(limit) as { job_id: string; entry_id: number; scenario_id: string | null; reasons: string; failed_at_seconds: number | null; comment: string; reviewed_at: string }[]
  return rows.map((r) => ({
    jobId: r.job_id,
    entryId: r.entry_id,
    scenarioId: r.scenario_id,
    reasons: safeParseArrayLocal(r.reasons),
    failedAtSeconds: r.failed_at_seconds,
    comment: r.comment,
    at: r.reviewed_at,
  }))
}

function safeParseArrayLocal(s: string | null): string[] {
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

// --- render lessons (rejection-derived prompt-writing rules) -----------------------

export type LessonConfidence = 'low' | 'medium' | 'high'
export type LessonStatus = 'pending' | 'approved' | 'dismissed'

export interface RenderLessonRow {
  id: number
  createdAt: string
  sourceJobId: string | null
  sourceReasons: string[]
  sourceComment: string | null
  rule: string
  category: string | null
  confidence: LessonConfidence
  status: LessonStatus
  uses: number
  matchedUses: number
  lastUsedAt: string | null
  dismissedAt: string | null
  dismissReason: string | null
  supersededBy: number | null
  importedFrom: string | null
}

/** Insert one lesson row. Returns the new id. The caller passes `confidence`; we trust it. */
export function insertLesson(l: {
  sourceJobId?: string | null
  sourceReasons?: string[]
  sourceComment?: string | null
  rule: string
  category?: string | null
  confidence?: LessonConfidence
  status?: LessonStatus
  importedFrom?: string | null
}): number {
  const r = getDb().prepare(`INSERT INTO render_lessons (created_at, source_job_id, source_reasons, source_comment, rule, category, confidence, status, imported_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      new Date().toISOString(),
      l.sourceJobId ?? null,
      JSON.stringify(l.sourceReasons ?? []),
      l.sourceComment ?? null,
      l.rule.trim(),
      l.category ?? null,
      l.confidence ?? 'low',
      l.status ?? 'pending',
      l.importedFrom ?? null,
    )
  return Number(r.lastInsertRowid)
}

/** Bulk insert (used by the one-time import of render-lessons.md). */
export function insertLessonsBulk(rows: { rule: string; category: string | null; createdAt: string; importedFrom: string }[]): void {
  if (!rows.length) return
  const d = getDb()
  const stmt = d.prepare(`INSERT INTO render_lessons (created_at, rule, category, confidence, status, imported_from) VALUES (?, ?, ?, 'low', 'pending', ?)`)
  d.transaction(() => {
    for (const r of rows) stmt.run(r.createdAt, r.rule.trim(), r.category, r.importedFrom)
  })()
}

export function getLesson(id: number): RenderLessonRow | null {
  const r = getDb().prepare('SELECT * FROM render_lessons WHERE id = ?').get(id) as any
  return r ? rowToLesson(r) : null
}

/** Active = approved or medium+ confidence pending (low-confidence pending is hidden until it's repeated or approved).
 *  Optional filter narrows to lessons with at least one matching scenario reason. */
export function listActiveLessons(): RenderLessonRow[] {
  return (getDb().prepare(`SELECT * FROM render_lessons
    WHERE status IN ('approved')
       OR (status = 'pending' AND confidence IN ('medium', 'high'))
       OR (status = 'pending' AND confidence = 'low' AND matched_uses >= 2)
    ORDER BY confidence DESC, uses DESC, id DESC`).all() as any[]).map(rowToLesson)
}

/** Every lesson the operator can act on in the Settings UI, newest first. */
export function listAllLessons(): RenderLessonRow[] {
  return (getDb().prepare('SELECT * FROM render_lessons ORDER BY id DESC').all() as any[]).map(rowToLesson)
}

export function approveLesson(id: number): void {
  getDb().prepare(`UPDATE render_lessons SET status = 'approved', confidence = 'high' WHERE id = ?`).run(id)
}

export function dismissLesson(id: number, reason: string): void {
  getDb().prepare(`UPDATE render_lessons SET status = 'dismissed', dismissed_at = ?, dismiss_reason = ? WHERE id = ?`)
    .run(new Date().toISOString(), reason.trim() || null, id)
}

/** Bump usage counters when a rule was injected into a generation prompt. */
export function bumpLessonUses(ids: number[]): void {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  getDb().prepare(`UPDATE render_lessons SET uses = uses + 1, last_used_at = ? WHERE id IN (${placeholders})`)
    .run(new Date().toISOString(), ...ids)
}

/** Record that one or more rules were checked in a rejection (per-rule checkbox in Review). Auto-promotes low → medium at 2 matches. */
export function recordLessonMatches(ids: number[]): void {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  const d = getDb()
  d.transaction(() => {
    d.prepare(`UPDATE render_lessons SET matched_uses = matched_uses + 1, last_used_at = ? WHERE id IN (${placeholders})`)
      .run(new Date().toISOString(), ...ids)
    d.prepare(`UPDATE render_lessons SET confidence = 'medium' WHERE confidence = 'low' AND matched_uses >= 2 AND id IN (${placeholders})`)
      .run(...ids)
  })()
}

/** Build the text block that goes onto every generation prompt. Groups by category if present.
 *  Stays under `budget` characters by keeping the highest-confidence + most-used rules; returns the IDs
 *  that actually fit so callers can bump their usage counters. */
export function formatLessonsBlock(rows: RenderLessonRow[], budget = 1500): { text: string; ids: number[] } {
  if (!rows.length) return { text: '', ids: [] }
  const sorted = [...rows].sort((a, b) => {
    const ca = confidenceRank(a.confidence), cb = confidenceRank(b.confidence)
    if (cb !== ca) return cb - ca
    if ((b.uses + b.matchedUses * 2) !== (a.uses + a.matchedUses * 2)) return (b.uses + b.matchedUses * 2) - (a.uses + a.matchedUses * 2)
    return b.id - a.id
  })
  const header = '\n\nRENDER LESSONS — rules learned from renders the reviewer rejected. Follow them while writing this prompt (they are about what the video model gets wrong, not about reach):\n'
  const out: { cat: string; rule: string; id: number }[] = []
  let len = header.length
  let truncated = false
  for (const r of sorted) {
    const line = `- ${r.rule}\n`
    const catLine = `### ${r.category || 'General'}\n`
    if (len + line.length + catLine.length > budget && out.length) { truncated = true; break }
    out.push({ cat: r.category || 'General', rule: r.rule, id: r.id })
    len += line.length + catLine.length
  }
  if (!out.length) return { text: '', ids: [] }
  // Group by category while preserving the chosen order.
  const groups = new Map<string, string[]>()
  const idOrder: number[] = []
  for (const o of out) {
    const arr = groups.get(o.cat) || groups.set(o.cat, []).get(o.cat)!
    arr.push(`- ${o.rule}`)
    if (!idOrder.includes(o.id)) idOrder.push(o.id)
  }
  const sections = [...groups.entries()].map(([cat, lines]) => `### ${cat}\n${lines.join('\n')}`)
  const tail = truncated ? '\n_(more rules available — review Settings → Review to enable them)_' : ''
  return { text: header + sections.join('\n\n') + tail, ids: idOrder }
}

function confidenceRank(c: LessonConfidence): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1
}

function rowToLesson(r: any): RenderLessonRow {
  return {
    id: r.id,
    createdAt: r.created_at,
    sourceJobId: r.source_job_id,
    sourceReasons: safeParseArray(r.source_reasons),
    sourceComment: r.source_comment,
    rule: r.rule,
    category: r.category,
    confidence: r.confidence,
    status: r.status,
    uses: r.uses ?? 0,
    matchedUses: r.matched_uses ?? 0,
    lastUsedAt: r.last_used_at,
    dismissedAt: r.dismissed_at,
    dismissReason: r.dismiss_reason,
    supersededBy: r.superseded_by,
    importedFrom: r.imported_from,
  }
}

function safeParseArray(s: string | null): string[] {
  if (!s) return []
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** Seed render_lessons from a legacy render-lessons.md, one time per install. Idempotent (meta flag). */
export function seedRenderLessonsFromFile(dataDir: string): number {
  if (getMeta('render_lessons_seeded')) return 0
  setMeta('render_lessons_seeded', new Date().toISOString())
  const p = path.join(dataDir, 'render-lessons.md')
  if (!fs.existsSync(p)) return 0
  let text = ''
  try { text = fs.readFileSync(p, 'utf8') } catch { return 0 }
  const rows = parseLessonsMarkdown(text)
  if (!rows.length) return 0
  insertLessonsBulk(rows.map((r) => ({ ...r, createdAt: new Date().toISOString(), importedFrom: 'render-lessons.md' })))
  // Rename so a future "Reset all memory" doesn't double-import, but keep a .bak for one release.
  try { fs.renameSync(p, p + '.imported-bak') } catch { /* ignore */ }
  return rows.length
}

/** Walk a markdown file, group bullet lines under their preceding `#` heading. */
export function parseLessonsMarkdown(text: string): { rule: string; category: string | null }[] {
  const out: { rule: string; category: string | null }[] = []
  let cat: string | null = null
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const h = line.match(/^#{1,3}\s+(.+)$/)
    if (h) { cat = h[1].trim(); continue }
    const b = line.match(/^[-*+]\s+(.+)$/)
    if (b) { out.push({ rule: b[1].trim(), category: cat }); continue }
    // Plain paragraph lines become a single "General" rule (rare in the existing file).
    out.push({ rule: line, category: cat || 'General' })
  }
  return out
}

// --- usage (Claude CLI calls) -------------------------------------------------------

export interface UsageRecord {
  provider?: Provider
  label: string
  model: string
  ok: boolean
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number
}

const localDayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function insertUsage(u: UsageRecord): void {
  const now = new Date()
  getDb().prepare(`INSERT INTO usage (at, day, label, model, ok, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, duration_ms, provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(now.toISOString(), localDayKey(now), u.label, u.model, u.ok ? 1 : 0, u.costUsd, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.durationMs, u.provider || 'claude')
}

/** Tokens one engine used today (input + output + cache), for the daily MiniMax limit. */
export function tokensToday(provider: Provider): number {
  const r = getDb().prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens), 0) n FROM usage WHERE day = ? AND provider = ?`).get(localDayKey(new Date()), provider) as { n: number }
  return r.n
}


/** Totals per label for one local day, and per day for the last `days` days. */
export function usageSummary(days: number): { today: UsageRow[]; byDay: UsageRow[]; byModelToday: UsageRow[]; byProviderToday: UsageRow[] } {
  const d = getDb()
  const today = localDayKey(new Date())
  const since = localDayKey(new Date(Date.now() - (days - 1) * 86400000))
  const cols = `COUNT(*) calls, COALESCE(SUM(cost_usd),0) costUsd, COALESCE(SUM(input_tokens),0) inputTokens, COALESCE(SUM(output_tokens),0) outputTokens, COALESCE(SUM(cache_read_tokens + cache_write_tokens),0) cacheTokens`
  return {
    today: d.prepare(`SELECT label key, provider, ${cols} FROM usage WHERE day = ? GROUP BY provider, label ORDER BY costUsd DESC`).all(today) as UsageRow[],
    byProviderToday: d.prepare(`SELECT provider key, ${cols} FROM usage WHERE day = ? GROUP BY provider`).all(today) as UsageRow[],
    byModelToday: d.prepare(`SELECT model key, ${cols} FROM usage WHERE day = ? GROUP BY model ORDER BY costUsd DESC`).all(today) as UsageRow[],
    byDay: d.prepare(`SELECT day key, ${cols} FROM usage WHERE day >= ? GROUP BY day ORDER BY day`).all(since) as UsageRow[],
  }
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
