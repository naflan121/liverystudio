import { useEffect, useMemo, useState } from 'react'
import { INK, PAPER, LINE, MUTE, ACCENT, INFO, GOOD, BAD, WAIT, SCREEN, ghostBtn, eyebrow, pageTitle } from './ui'
import { snippet } from '@shared/util'
import type { Entry, RenderJob, RenderOverview, RenderStatus } from '@shared/types'

export const RENDER_META: Record<RenderStatus, { label: string; color: string; live: boolean }> = {
  queued: { label: 'Queued', color: WAIT, live: true },
  starting: { label: 'Starting instance', color: INFO, live: true },
  sending: { label: 'Sending to Dola', color: INFO, live: true },
  generating: { label: 'Generating', color: INFO, live: true },
  downloading: { label: 'Downloading', color: INFO, live: true },
  done: { label: 'Rendered', color: GOOD, live: false },
  failed: { label: 'Failed', color: BAD, live: false },
  cancelled: { label: 'Cancelled', color: MUTE, live: false },
}

function since(iso?: string): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

const small = { ...ghostBtn, padding: '5px 11px', fontSize: 12.5 }

// Date range for "Prompts ready to render" (by when the prompt was written, local time).
type Range = 'today' | '3days' | 'month' | 'lastMonth' | 'all'
const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '3days', label: 'Last 3 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'all', label: 'All' },
]
function inRange(ts: string, r: Range): boolean {
  if (r === 'all') return true
  const t = new Date(ts).getTime()
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (r === 'today') return t >= startOfToday
  if (r === '3days') return t >= startOfToday - 2 * 86400000 // today + the two days before
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (r === 'month') return t >= startOfMonth
  return t >= new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() && t < startOfMonth
}
const RANGE_KEY = 'studio.readyRange'
function loadRange(): Range {
  try { const v = localStorage.getItem(RANGE_KEY) as Range | null; return v && RANGES.some((r) => r.id === v) ? v : '3days' } catch { return '3days' }
}

/** Latest job per entry (jobs are stored newest-first). */
export function latestJobByEntry(jobs: RenderJob[]): Map<number, RenderJob> {
  const m = new Map<number, RenderJob>()
  for (const j of jobs) if (!m.has(j.entryId)) m.set(j.entryId, j)
  return m
}

function JobCard({ job, onOpenEntry, entry }: { job: RenderJob; entry?: Entry; onOpenEntry: (h: Entry) => void }) {
  const meta = RENDER_META[job.status]
  const [preview, setPreview] = useState(false)
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: 'var(--surface)', padding: '12px 14px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta.color, flexShrink: 0, animation: meta.live && job.status !== 'queued' ? 'll-pulse 1.4s ease-in-out infinite' : undefined }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</div>
          <div style={{ fontSize: 11.5, color: MUTE }}>
            <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
            {job.review && <span style={{ color: job.review.verdict === 'approved' ? GOOD : job.review.verdict === 'rejected' ? BAD : MUTE, fontWeight: 600 }}> · {job.review.verdict}</span>}
            {job.status === 'done' && !job.review && <span style={{ color: INFO }}> · awaiting review</span>}
            {job.instanceName ? ` · ${job.instanceName}` : ''}
            {job.status === 'done' ? ` · ${since(job.endedAt)}${job.bytes ? ` · ${(job.bytes / 1e6).toFixed(1)} MB` : ''}${job.width ? ` · ${job.width}×${job.height}` : ''}` : ` · queued ${since(job.createdAt)}`}
          </div>
        </div>
        <span style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {entry && <button onClick={() => onOpenEntry(entry)} style={small}>Prompt</button>}
          {job.status === 'done' && job.file && <>
            <button onClick={() => setPreview((p) => !p)} style={{ ...small, color: ACCENT, borderColor: ACCENT }}>{preview ? 'Hide' : '▶ Watch'}</button>
            <button onClick={() => window.api.renderShowFile(job.file!)} style={small}>Show file</button>
          </>}
          {meta.live && <button onClick={() => window.api.renderCancel(job.id)} style={{ ...small, color: MUTE }}>Cancel</button>}
          {job.status === 'failed' && job.chatUrl && <button onClick={() => window.api.renderRetry(job.id, false)} title="Look in the same Dola chat again for the finished video — no re-send" style={small}>Check again</button>}
          {(job.status === 'failed' || job.status === 'cancelled') && <button onClick={() => window.api.renderRetry(job.id, true)} title="Send the prompt to Dola again from scratch" style={small}>Re-render</button>}
          {!meta.live && <button onClick={() => window.api.renderRemove(job.id)} title="Remove from this list (the video file stays on disk)" style={{ ...small, color: MUTE }}>✕</button>}
        </span>
      </div>
      {job.note && <div style={{ fontSize: 12, color: MUTE }}>{job.note}</div>}
      {job.error && <div style={{ fontSize: 12, color: BAD, background: 'var(--bad-soft)', borderRadius: 8, padding: '6px 10px', wordBreak: 'break-word' }}>{job.error}</div>}
      {preview && job.file && (
        <video src={`studio-media://${job.id}/video.mp4`} controls autoPlay style={{ width: '100%', maxHeight: 560, borderRadius: 10, background: SCREEN }} />
      )}
    </div>
  )
}

/** Per-render "Reference images" switch; starts from Settings → Render. */
function RefsToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label title="Ask Dola to search for reference photos of the exact aircraft (and the scenario's Image 2, if set) and use them for this render" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: on ? INK : MUTE, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: ACCENT, width: 14, height: 14 }} /> Reference images
    </label>
  )
}

/** Compact render status + actions for the prompt open in the lab. */
export function RenderStrip({ entry, job, refsDefault }: { entry: Entry; job?: RenderJob; refsDefault: boolean }) {
  const [watch, setWatch] = useState(false)
  const [refs, setRefs] = useState(refsDefault)
  useEffect(() => { setRefs(refsDefault) }, [entry.id, refsDefault])
  const meta = job ? RENDER_META[job.status] : null
  const box = { border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 16px', background: PAPER, display: 'grid', gap: 8 } as const
  if (!job || job.status === 'cancelled') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: MUTE }}>Not rendered yet.</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RefsToggle on={refs} onChange={setRefs} />
          <button onClick={() => window.api.renderSubmit([entry.id], { references: refs })} style={{ ...ghostBtn, color: ACCENT, borderColor: ACCENT }}>🎬 Render on Dola</button>
        </span>
      </div>
    )
  }
  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta!.color, animation: meta!.live && job.status !== 'queued' ? 'll-pulse 1.4s ease-in-out infinite' : undefined }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: meta!.color }}>{meta!.label}</span>
        <span style={{ fontSize: 12, color: MUTE, flex: 1, minWidth: 0 }}>{job.instanceName ? `on ${job.instanceName}` : ''}{job.note ? ` · ${job.note}` : ''}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {job.status === 'done' && job.file && <>
            <button onClick={() => setWatch((w) => !w)} style={{ ...small, color: ACCENT, borderColor: ACCENT }}>{watch ? 'Hide' : '▶ Watch'}</button>
            <button onClick={() => window.api.renderShowFile(job.file!)} style={small}>Show file</button>
          </>}
          {meta!.live && <button onClick={() => window.api.renderCancel(job.id)} style={{ ...small, color: MUTE }}>Cancel</button>}
          {job.status === 'failed' && job.chatUrl && <button onClick={() => window.api.renderRetry(job.id, false)} style={small}>Check again</button>}
          {job.status === 'failed' && <button onClick={() => window.api.renderRetry(job.id, true)} title="Send this prompt to Dola again from scratch" style={small}>Re-render</button>}
          {job.status === 'done' && <><RefsToggle on={refs} onChange={setRefs} /><button onClick={() => window.api.renderSubmit([entry.id], { references: refs })} title="Render another take of this prompt" style={small}>Another take</button></>}
        </span>
      </div>
      {job.error && <div style={{ fontSize: 12, color: BAD, wordBreak: 'break-word' }}>{job.error}</div>}
      {watch && job.file && <video src={`studio-media://${job.id}/video.mp4`} controls autoPlay style={{ width: '100%', maxHeight: 520, borderRadius: 10, background: SCREEN }} />}
    </div>
  )
}

export function Renders({ entries, jobs, onOpenEntry, onClose, onRefresh, refsDefault }: {
  refsDefault: boolean
  entries: Entry[]
  jobs: RenderJob[]
  onOpenEntry: (h: Entry) => void
  onClose: () => void
  /** Re-read history (incl. new Livery Lab prompts); resolves to how many were added. */
  onRefresh: () => Promise<number>
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [refs, setRefs] = useState(refsDefault)
  const [refreshMsg, setRefreshMsg] = useState('')
  async function refresh(): Promise<void> {
    setRefreshing(true); setRefreshMsg('')
    try {
      const added = await onRefresh()
      setRefreshMsg(added ? `+${added} new from Livery Lab` : 'Up to date')
    } catch { setRefreshMsg('Refresh failed') } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshMsg(''), 4000)
    }
  }
  const [ov, setOv] = useState<RenderOverview | null>(null)
  const [picked, setPicked] = useState<number[]>([])
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active')
  const [range, setRangeState] = useState<Range>(loadRange)
  const setRange = (r: Range): void => {
    setRangeState(r); setPicked([])
    try { localStorage.setItem(RANGE_KEY, r) } catch { /* per-viewer convenience only */ }
  }

  // Instances + today's count come from the main process; poll gently while open.
  useEffect(() => {
    let alive = true
    const load = (): void => { window.api.renderOverview().then((o) => { if (alive) setOv(o) }).catch(() => { /* ignore */ }) }
    load()
    const t = setInterval(load, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [jobs])

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const latest = useMemo(() => latestJobByEntry(jobs), [jobs])
  // Prompts still awaiting a post that have no live or finished render yet.
  // Filtered by when the prompt was written; older ones were often rendered by hand in the Lab days.
  const unrendered = useMemo(() => entries.filter((e) => e.status === 'queued'
    && inRange(e.ts, range)
    && (() => {
      const j = latest.get(e.id)
      return !j || j.status === 'failed' || j.status === 'cancelled'
    })()), [entries, latest, range])

  const shown = jobs.filter((j) => filter === 'all' ? true : filter === 'done' ? j.status === 'done' : RENDER_META[j.status].live || j.status === 'failed')
  const liveCount = jobs.filter((j) => RENDER_META[j.status].live).length

  async function renderPicked(): Promise<void> {
    if (!picked.length) return
    await window.api.renderSubmit(picked, { references: refs })
    setPicked([])
  }

  const cap = ov?.dailyCap ?? 0
  const sent = ov?.sentToday ?? 0

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK, fontFamily: 'var(--f-body)' }}>
      <style>{'@keyframes ll-pulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 32px', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={eyebrow}>Render · Dola / Seedance</div>
            <h1 style={{ ...pageTitle, marginTop: 2 }}>Video renders</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ov?.paused
              ? <button onClick={() => window.api.renderResume().then(() => window.api.renderOverview().then(setOv))} style={ghostBtn}>Resume sending</button>
              : <button onClick={() => window.api.renderPause().then(() => window.api.renderOverview().then(setOv))} title="Stop sending new renders to Dola. Videos already sent keep generating and downloading." style={ghostBtn}>Pause sending</button>}
            <button onClick={() => window.api.renderOpenOutput()} style={ghostBtn}>Open video folder</button>
            
          </div>
        </div>

{ov?.paused && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid var(--warn)', background: 'var(--surface)', borderRadius: 12, padding: '10px 14px' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontSize: 15, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--warn)' }}>Sending paused</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--ink)' }}>{ov?.paused.reason} <span style={{ color: 'var(--mute)' }}>Videos already sent keep generating and downloading.</span></span>
            <button onClick={() => window.api.renderResume().then(() => window.api.renderOverview().then(setOv))} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Resume sending</button>
          </div>
        )}

        {/* Today + instances */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: 14 }}>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: 'var(--surface)', padding: '14px 16px' }}>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: MUTE, fontWeight: 600 }}>Sent today</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: sent >= cap && cap > 0 ? BAD : INK }}>{sent}<span style={{ fontSize: 16, color: MUTE, fontWeight: 500 }}> / {cap}</span></div>
            <div style={{ height: 6, background: 'var(--track)', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
              <div style={{ width: `${cap ? Math.min(100, (sent / cap) * 100) : 0}%`, height: '100%', background: sent >= cap ? BAD : ACCENT }} />
            </div>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6 }}>{liveCount} in progress · daily cap in Settings → Render</div>
          </div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: 'var(--surface)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: MUTE, fontWeight: 600 }}>Dola instances</div>
              {ov?.instances?.some((i) => i.creditsOutUntil) && <button onClick={() => window.api.renderClearCredits().then(() => window.api.renderOverview().then(setOv))} title="Use this if you topped an account up, or Dola reset earlier than expected" style={{ ...ghostBtn, marginLeft: 'auto', padding: '2px 9px', fontSize: 11.5 }}>Clear credit rests</button>}
            </div>
            {!ov ? <div style={{ fontSize: 12.5, color: MUTE }}>Checking…</div>
              : ov.instances === null ? <div style={{ fontSize: 12.5, color: BAD }}>{ov.error}</div>
                : ov.instances.length === 0 ? <div style={{ fontSize: 12.5, color: MUTE }}>No instances configured in DolaMultiBrowser.</div>
                  : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ov.instances.map((i) => {
                        const back = i.creditsOutUntil ? new Date(i.creditsOutUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                        const state = i.excluded ? 'reserved' : i.busy ? 'rendering' : i.creditsOutUntil ? `no credits · back ${back}` : i.cooldownUntil ? 'cooling down' : i.isInitialized ? 'ready' : 'stopped'
                        const color = i.excluded ? MUTE : i.busy ? INFO : i.creditsOutUntil ? 'var(--warn)' : i.cooldownUntil ? 'var(--warn)' : i.isInitialized ? GOOD : WAIT
                        return (
                          <span key={i.id} title={`#${i.id} · ${i.status}${i.creditsOutUntil ? ` · out of Dola video credits${i.creditsNeed != null ? ` (needs ${i.creditsNeed}, had ${i.creditsLeft ?? 0})` : ''}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '4px 10px', fontSize: 12, opacity: i.excluded ? 0.6 : 1 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                            <strong style={{ fontWeight: 600 }}>{i.name}</strong><span style={{ color: MUTE }}>{state}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
          </div>
        </div>

        {/* Ready to render */}
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: 'var(--surface)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: unrendered.length ? 10 : 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Prompts ready to render <span style={{ color: MUTE, fontWeight: 500 }}>· {unrendered.length}</span></div>
              <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                {RANGES.map((r) => (
                  <button key={r.id} onClick={() => setRange(r.id)} style={{ borderRadius: 20, padding: '3px 10px', fontSize: 12, cursor: 'pointer', border: `1px solid ${range === r.id ? INK : LINE}`, background: range === r.id ? INK : 'var(--surface)', color: range === r.id ? 'var(--on-ink)' : MUTE, fontWeight: range === r.id ? 600 : 500 }}>{r.label}</button>
                ))}
              </span>
            </div>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {refreshMsg && <span style={{ fontSize: 12, color: refreshMsg.startsWith('+') ? GOOD : MUTE }}>{refreshMsg}</span>}
              <button onClick={refresh} disabled={refreshing} title="Reload the prompt list and pull in prompts created in Livery Lab" style={{ ...small, opacity: refreshing ? 0.6 : 1 }}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button>
            </span>
            {unrendered.length > 0 && (
              <span style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPicked(picked.length === unrendered.length ? [] : unrendered.map((e) => e.id))} style={small}>{picked.length === unrendered.length ? 'Select none' : 'Select all'}</button>
                <RefsToggle on={refs} onChange={setRefs} />
                <button onClick={renderPicked} disabled={!picked.length} style={{ ...small, background: picked.length ? ACCENT : 'var(--surface)', color: picked.length ? '#fff' : MUTE, borderColor: picked.length ? ACCENT : LINE }}>🎬 Render {picked.length || ''}</button>
              </span>
            )}
          </div>
          {unrendered.length === 0
            ? <div style={{ fontSize: 12.5, color: MUTE }}>No unrendered prompts {range === 'all' ? '' : `in "${RANGES.find((r) => r.id === range)!.label}"`}. Try another range, or generate more in the lab.</div>
            : (
              <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                {unrendered.map((e) => (
                  <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: picked.includes(e.id) ? 'var(--accent-soft)' : 'transparent' }}>
                    <input type="checkbox" checked={picked.includes(e.id)} onChange={() => setPicked((p) => p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id])} style={{ accentColor: ACCENT, width: 15, height: 15 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong style={{ fontWeight: 600 }}>{e.title || snippet(e.text)}</strong> <span style={{ color: MUTE }}>· {e.scenario}</span></span>
                    {latest.get(e.id) && <span style={{ fontSize: 11.5, color: BAD }}>last render {RENDER_META[latest.get(e.id)!.status].label.toLowerCase()}</span>}
                  </label>
                ))}
              </div>
            )}
        </div>

        {/* Jobs */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['active', 'done', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ ...small, background: filter === f ? INK : 'var(--surface)', color: filter === f ? 'var(--on-ink)' : INK, borderColor: filter === f ? INK : LINE }}>
                {f === 'active' ? 'In progress & failed' : f === 'done' ? 'Rendered' : 'All'}
              </button>
            ))}
          </div>
          {shown.length === 0
            ? <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', color: MUTE, fontSize: 13 }}>Nothing here yet.</div>
            : shown.map((j) => <JobCard key={j.id} job={j} entry={byId.get(j.entryId)} onOpenEntry={onOpenEntry} />)}
        </div>
      </div>
    </div>
  )
}
