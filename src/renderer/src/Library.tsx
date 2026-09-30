import { useMemo, useState } from 'react'
import { INK, PAPER, LINE, MUTE, ACCENT, INFO, GOOD, BAD, WAIT, SURFACE, SCREEN, MONO, ghostBtn, sel } from './ui'
import { PageHeader } from './Shell'
import { REACH } from '@shared/domain'
import { snippet } from '@shared/util'
import { reasonLabel } from '@shared/review'
import type { Entry, ReachId, RenderJob } from '@shared/types'

function statusMeta(h: Entry): { label: string; color: string } {
  if (h.status === 'scored') { const r = REACH.find((x) => x.id === h.reach); return { label: r ? r.label : 'Scored', color: r ? r.color : 'var(--good)' } }
  if (h.status === 'posted') return { label: 'Posted', color: INFO }
  if (h.status === 'skipped') return { label: 'Unusable', color: MUTE }
  return { label: 'Not posted', color: WAIT }
}
function ago(ts: string): string {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 7) return `${d} days ago`
  const w = Math.floor(d / 7)
  return `${w} week${w === 1 ? '' : 's'} ago`
}
const verdictColor = (j: RenderJob): string => j.review?.verdict === 'approved' ? GOOD : j.review?.verdict === 'rejected' ? BAD : j.review?.verdict === 'skipped' ? MUTE : INFO
const verdictLabel = (j: RenderJob): string => j.review ? j.review.verdict[0].toUpperCase() + j.review.verdict.slice(1) : 'Awaiting review'

type StatusFilter = 'all' | 'toscore' | 'scored' | 'skipped'
type VideoFilter = 'any' | 'video' | 'approved' | 'none'

const chip = (on: boolean): React.CSSProperties => ({ borderRadius: 20, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: on ? 600 : 500, border: `1px solid ${on ? INK : LINE}`, background: on ? INK : SURFACE, color: on ? 'var(--on-ink)' : MUTE })

export function Library({ entries, jobs, openId, onOpen }: {
  entries: Entry[]
  jobs: RenderJob[]
  openId: number | null
  onOpen: (h: Entry) => void
}) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [video, setVideo] = useState<VideoFilter>('any')
  const [reach, setReach] = useState<ReachId | 'any'>('any')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [watching, setWatching] = useState<string | null>(null)

  // Finished takes per prompt, newest first.
  const takes = useMemo(() => {
    const m = new Map<number, RenderJob[]>()
    for (const j of jobs) if (j.status === 'done' && j.file) m.set(j.entryId, [...(m.get(j.entryId) || []), j])
    return m
  }, [jobs])

  const counts = useMemo(() => ({
    all: entries.length,
    toscore: entries.filter((h) => h.status === 'queued' || h.status === 'posted').length,
    scored: entries.filter((h) => h.status === 'scored').length,
    skipped: entries.filter((h) => h.status === 'skipped').length,
    video: entries.filter((h) => takes.has(h.id)).length,
    approved: entries.filter((h) => (takes.get(h.id) || []).some((j) => j.review?.verdict === 'approved')).length,
  }), [entries, takes])

  const results = useMemo(() => {
    let out = entries
    if (status === 'toscore') out = out.filter((h) => h.status === 'queued' || h.status === 'posted')
    else if (status === 'scored') out = out.filter((h) => h.status === 'scored')
    else if (status === 'skipped') out = out.filter((h) => h.status === 'skipped')
    if (video === 'video') out = out.filter((h) => takes.has(h.id))
    else if (video === 'approved') out = out.filter((h) => (takes.get(h.id) || []).some((j) => j.review?.verdict === 'approved'))
    else if (video === 'none') out = out.filter((h) => !takes.has(h.id))
    if (reach !== 'any') out = out.filter((h) => h.reach === reach)
    const needle = q.trim().toLowerCase()
    if (needle) {
      out = out.filter((h) => (h.title || '').toLowerCase().includes(needle) || (h.nudge || '').toLowerCase().includes(needle)
        || h.scenario.toLowerCase().includes(needle) || (!h.title && h.text.toLowerCase().includes(needle)))
    }
    return out
  }, [entries, takes, status, video, reach, q])

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 24px 32px', display: 'grid', gap: 14 }}>
        <PageHeader eyebrow="Library · every prompt and its videos" title="Library" />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, scenario or direction…" style={{ ...sel, flex: '1 1 280px', boxSizing: 'border-box' }} />
          <select value={reach} onChange={(e) => setReach(e.target.value as ReachId | 'any')} style={{ ...sel, width: 'auto', minWidth: 150 }}>
            <option value="any">Any result</option>
            {REACH.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['all', 'All'], ['toscore', 'Not scored'], ['scored', 'Scored'], ['skipped', 'Unusable']] as [StatusFilter, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setStatus(id)} style={chip(status === id)}>{label} · {counts[id]}</button>
          ))}
          <span style={{ width: 1, height: 20, background: LINE, margin: '0 4px' }} />
          {([['any', 'Any video'], ['video', 'With video'], ['approved', 'Approved video'], ['none', 'No video']] as [VideoFilter, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setVideo(id)} style={chip(video === id)}>{label}{id === 'video' ? ` · ${counts.video}` : id === 'approved' ? ` · ${counts.approved}` : ''}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTE }}>{results.length} of {entries.length}</span>
        </div>

        {results.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTE, padding: '30px 0', textAlign: 'center' }}>{q.trim() ? `No prompts match “${q.trim()}”.` : 'Nothing matches these filters.'}</div>
        ) : (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: SURFACE, overflow: 'hidden' }}>
            {results.map((h, i) => {
              const m = statusMeta(h)
              const t = takes.get(h.id) || []
              const approved = t.filter((j) => j.review?.verdict === 'approved').length
              const rejected = t.filter((j) => j.review?.verdict === 'rejected').length
              const isOpen = expanded === h.id
              return (
                <div key={h.id} style={{ borderTop: i ? `1px solid ${LINE}` : 'none', background: openId === h.id ? 'var(--accent-soft)' : undefined }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto auto', gap: 12, alignItems: 'center', padding: '10px 14px' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.color }} title={m.label} />
                    <button onClick={() => onOpen(h)} title="Open in Create" style={{ all: 'unset', cursor: 'pointer', minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || snippet(h.text)}</span>
                      <span style={{ fontSize: 12, color: MUTE, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.scenario}{h.hook ? ' · hook' : ''}{h.longPrompt ? ' · long' : ''}{h.nudge ? ` · ↳ ${h.nudge}` : ''}
                      </span>
                    </button>
                    <span>
                      {t.length > 0
                        ? <button onClick={() => { setExpanded(isOpen ? null : h.id); setWatching(null) }} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          ▶ {t.length} take{t.length === 1 ? '' : 's'}
                          {approved > 0 && <span style={{ color: GOOD }}>· {approved} ✓</span>}
                          {rejected > 0 && <span style={{ color: BAD }}>· {rejected} ✗</span>}
                        </button>
                        : <span style={{ fontSize: 12, color: MUTE }}>no video</span>}
                    </span>
                    <span style={{ fontSize: 11.5, textAlign: 'right', minWidth: 92 }}>
                      <span style={{ display: 'block', color: m.color, fontWeight: 600 }}>{m.label}</span>
                      <span style={{ color: MUTE }}>{ago(h.ts)}</span>
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '0 14px 12px 36px', display: 'grid', gap: 8 }}>
                      {t.map((j) => (
                        <div key={j.id} style={{ display: 'grid', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                            <span style={{ color: verdictColor(j), fontWeight: 600 }}>{verdictLabel(j)}</span>
                            <span style={{ color: MUTE }}>{j.instanceName || '?'} · {j.endedAt ? ago(j.endedAt) : ''}{j.bytes ? ` · ${(j.bytes / 1e6).toFixed(1)} MB` : ''}</span>
                            {j.review?.reasons.length ? <span style={{ color: BAD }}>{j.review.reasons.map(reasonLabel).join(', ')}</span> : null}
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                              <button onClick={() => setWatching(watching === j.id ? null : j.id)} style={{ ...ghostBtn, padding: '3px 10px', fontSize: 12, color: ACCENT, borderColor: ACCENT }}>{watching === j.id ? 'Hide' : '▶ Watch'}</button>
                              <button onClick={() => window.api.renderShowFile(j.file!)} style={{ ...ghostBtn, padding: '3px 10px', fontSize: 12 }}>Show file</button>
                            </span>
                          </div>
                          {watching === j.id && (
                            <video key={`${j.id}:${j.file}`} src={`studio-media://${j.id}/video.mp4`} controls autoPlay style={{ width: 'min(100%, 360px)', aspectRatio: j.width && j.height ? `${j.width} / ${j.height}` : '9 / 16', borderRadius: 10, background: SCREEN }} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ fontFamily: MONO, fontSize: 11, color: MUTE }}>Click a title to open it in Create.</div>
      </div>
    </div>
  )
}
