import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INK, PAPER, LINE, MUTE, ACCENT, GOOD, BAD, WAIT, SCREEN, SCREEN_TX, ghostBtn, lbl } from './ui'
import { REJECT_REASONS, reasonLabel } from '@shared/review'
import type { Entry, RenderJob } from '@shared/types'

type Filter = 'awaiting' | 'approved' | 'rejected' | 'all'

const small = { ...ghostBtn, padding: '5px 11px', fontSize: 12.5 }

function when(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return `${sameDay ? 'today' : `${d.getDate()}/${d.getMonth() + 1}`} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function verdictMeta(j: RenderJob): { label: string; color: string } {
  if (j.review?.verdict === 'approved') return { label: 'Approved', color: GOOD }
  if (j.review?.verdict === 'rejected') return { label: 'Rejected', color: BAD }
  return { label: 'Awaiting review', color: ACCENT }
}

/** Every finished take of the prompt is rejected and nothing is still rendering (mirrors main/review.ts). */
function allTakesRejected(jobs: RenderJob[], entryId: number): boolean {
  const takes = jobs.filter((j) => j.entryId === entryId)
  if (takes.some((j) => !['done', 'failed', 'cancelled'].includes(j.status))) return false
  const done = takes.filter((j) => j.status === 'done')
  return done.length > 0 && done.every((j) => j.review?.verdict === 'rejected')
}

export function Review({ entries, jobs, onOpenEntry, onClose }: {
  entries: Entry[]
  jobs: RenderJob[]
  onOpenEntry: (h: Entry) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<Filter>('awaiting')
  const [selId, setSelId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [stats, setStats] = useState<{ scenarios: { scenario: string; approved: number; rejected: number }[]; reasons: { reason: string; n: number }[] } | null>(null)

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const takes = useMemo(() => jobs.filter((j) => j.status === 'done' && j.file), [jobs])
  const counts = useMemo(() => ({
    awaiting: takes.filter((j) => !j.review).length,
    approved: takes.filter((j) => j.review?.verdict === 'approved').length,
    rejected: takes.filter((j) => j.review?.verdict === 'rejected').length,
    all: takes.length,
  }), [takes])
  const list = useMemo(() => {
    const l = takes.filter((j) => filter === 'all' ? true : filter === 'awaiting' ? !j.review : j.review?.verdict === filter)
    // Awaiting: oldest first (review in the order they rendered). Others: newest first.
    return filter === 'awaiting' ? [...l].reverse() : l
  }, [takes, filter])

  const sel = list.find((j) => j.id === selId) || takes.find((j) => j.id === selId) || list[0] || null
  const entry = sel ? byId.get(sel.entryId) : undefined

  useEffect(() => { window.api.reviewStats().then(setStats).catch(() => { /* ignore */ }) }, [counts.approved, counts.rejected])
  useEffect(() => { setRejecting(false); setReasons([]); setComment(''); setErr(''); setShowPrompt(false) }, [sel?.id])

  const nextAwaiting = useCallback((afterId: string): string | null => {
    const awaiting = [...takes].reverse().filter((j) => !j.review && j.id !== afterId)
    return awaiting[0]?.id ?? null
  }, [takes])

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setErr('')
    try { await fn(); return true } catch (e: any) { setErr(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); return false } finally { setBusy(false) }
  }

  async function approve(): Promise<void> {
    if (!sel || busy) return
    const id = sel.id
    if (await run(() => window.api.reviewDecide(id, 'approved', [], comment))) { if (filter === 'awaiting') setSelId(nextAwaiting(id)) }
  }

  async function reject(): Promise<void> {
    if (!sel || busy) return
    if (!reasons.length && !comment.trim()) { setErr('Pick at least one reason or write a comment — it is what the learning uses.'); return }
    const id = sel.id
    if (await run(() => window.api.reviewDecide(id, 'rejected', reasons, comment))) {
      setRejecting(false)
      // Stay on the take when it was the last one of its prompt, so the next-step choices are visible.
      if (filter === 'awaiting' && !allTakesRejected(jobs.map((j) => (j.id === id ? { ...j, review: { verdict: 'rejected', reasons, comment, at: '' } } : j)), sel.entryId)) setSelId(nextAwaiting(id))
      else setSelId(id)
    }
  }

  // Keyboard: A approve · R reject panel · ←/→ previous/next · Esc close panel. Ignored while typing.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => { /* set below */ })
  keyRef.current = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && rejecting) { e.preventDefault(); reject() }
      return
    }
    if (!sel) return
    const i = list.findIndex((j) => j.id === sel.id)
    if (e.key === 'a' || e.key === 'A') { if (!sel.review) { e.preventDefault(); approve() } }
    else if (e.key === 'r' || e.key === 'R') { if (!sel.review) { e.preventDefault(); setRejecting(true) } }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (list[i + 1]) setSelId(list[i + 1].id) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (list[i - 1]) setSelId(list[i - 1].id) }
    else if (e.key === 'Escape') setRejecting(false)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent): void => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const everyRejected = sel ? allTakesRejected(jobs, sel.entryId) && entry?.status !== 'skipped' : false
  const takeCount = sel ? takes.filter((j) => j.entryId === sel.entryId).length : 0

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <style>{`
        .rv-grid{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}
        .rv-detail{display:grid;grid-template-columns:minmax(260px,400px) minmax(0,1fr);gap:18px;align-items:start}
        @media (max-width:1100px){.rv-detail{grid-template-columns:1fr}}
        @media (max-width:760px){.rv-grid{grid-template-columns:1fr}}
      `}</style>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT, fontWeight: 600 }}>Review · approve or reject each take</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Review renders</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: MUTE }}>Keys: <b>A</b> approve · <b>R</b> reject · <b>← →</b> move</span>
            <button onClick={() => window.api.renderOpenOutput()} style={ghostBtn}>Open video folder</button>
            <button onClick={onClose} style={ghostBtn}>Back to lab</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['awaiting', 'approved', 'rejected', 'all'] as Filter[]).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setSelId(null) }} style={{ ...small, background: filter === f ? INK : '#fff', color: filter === f ? '#fff' : INK, borderColor: filter === f ? INK : LINE }}>
              {f === 'awaiting' ? 'Awaiting review' : f === 'approved' ? 'Approved' : f === 'rejected' ? 'Rejected' : 'All'} · {counts[f]}
            </button>
          ))}
        </div>

        <div className="rv-grid">
          {/* Take list */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: 8, display: 'grid', gap: 4, maxHeight: '78vh', overflowY: 'auto' }}>
            {list.length === 0
              ? <div style={{ fontSize: 12.5, color: MUTE, padding: '10px 8px', lineHeight: 1.5 }}>{filter === 'awaiting' ? 'Nothing waiting. Finished renders show up here automatically.' : 'Nothing here yet.'}</div>
              : list.map((j) => {
                const m = verdictMeta(j)
                const on = sel?.id === j.id
                return (
                  <button key={j.id} onClick={() => setSelId(j.id)} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${on ? ACCENT : 'transparent'}`, background: on ? '#FBEADF' : 'transparent', borderRadius: 9, padding: '8px 9px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} title={m.label} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                      <span style={{ display: 'block', fontSize: 11, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{byId.get(j.entryId)?.scenario || '—'} · {when(j.endedAt)}{j.auto ? ' · auto retry' : ''}</span>
                    </span>
                  </button>
                )
              })}
          </div>

          {/* Detail */}
          {!sel ? (
            <div style={{ border: `1px dashed ${LINE}`, borderRadius: 12, padding: '40px 24px', textAlign: 'center', color: MUTE, fontSize: 13.5 }}>Select a take to review it.</div>
          ) : (
            <div className="rv-detail">
              <video key={`${sel.id}:${sel.file}`} src={`studio-media://${sel.id}/video.mp4`} controls autoPlay loop style={{ width: '100%', maxHeight: '78vh', aspectRatio: sel.width && sel.height ? `${sel.width} / ${sel.height}` : '9 / 16', borderRadius: 12, background: SCREEN }} />

              <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{sel.title}</div>
                  <div style={{ fontSize: 12.5, color: MUTE, marginTop: 4 }}>
                    {entry?.scenario || '—'} · {sel.instanceName || '?'} · rendered {when(sel.endedAt)}{sel.bytes ? ` · ${(sel.bytes / 1e6).toFixed(1)} MB` : ''}{takeCount > 1 ? ` · take ${takes.filter((j) => j.entryId === sel.entryId).reverse().findIndex((j) => j.id === sel.id) + 1} of ${takeCount}` : ''}
                  </div>
                </div>

                {/* Verdict / actions */}
                {sel.review ? (
                  <div style={{ border: `1px solid ${verdictMeta(sel).color}`, borderRadius: 12, padding: '12px 14px', background: '#fff', display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: verdictMeta(sel).color }}>{verdictMeta(sel).label}</span>
                      <span style={{ fontSize: 12, color: MUTE }}>{when(sel.review.at)} · moved to {sel.review.verdict}\</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button disabled={busy} onClick={() => run(() => window.api.reviewUndo(sel.id))} style={small}>Undo</button>
                        <button onClick={() => window.api.renderShowFile(sel.file!)} style={small}>Show file</button>
                      </span>
                    </div>
                    {sel.review.reasons.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{sel.review.reasons.map((r) => <span key={r} style={{ fontSize: 12, borderRadius: 20, padding: '3px 10px', background: '#F6E4E1', color: BAD }}>{reasonLabel(r)}</span>)}</div>}
                    {sel.review.comment && <div style={{ fontSize: 13, color: INK }}>“{sel.review.comment}”</div>}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy} onClick={approve} style={{ flex: 1, background: GOOD, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Approve <span style={{ opacity: 0.7, fontSize: 12 }}>A</span></button>
                      <button disabled={busy} onClick={() => setRejecting((r) => !r)} style={{ flex: 1, background: rejecting ? BAD : '#fff', color: rejecting ? '#fff' : BAD, border: `1px solid ${BAD}`, borderRadius: 10, padding: '12px 16px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Reject… <span style={{ opacity: 0.7, fontSize: 12 }}>R</span></button>
                    </div>
                    {rejecting && (
                      <div style={{ border: `1px solid ${BAD}`, borderRadius: 12, padding: '12px 14px', background: '#fff', display: 'grid', gap: 10 }}>
                        <div style={{ ...lbl, marginBottom: 0 }}>What went wrong?</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {REJECT_REASONS.map((r) => {
                            const on = reasons.includes(r.id)
                            return <button key={r.id} onClick={() => setReasons((p) => on ? p.filter((x) => x !== r.id) : [...p, r.id])} style={{ borderRadius: 20, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', border: `1px solid ${on ? BAD : LINE}`, background: on ? '#F6E4E1' : '#fff', color: on ? BAD : INK }}>{r.label}</button>
                          })}
                        </div>
                        <textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="What exactly went wrong? e.g. “plane rolled inverted at 0:06”. This is what the learning reads." style={{ width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', color: INK }} />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button disabled={busy} onClick={reject} style={{ background: BAD, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Reject & move to rejected\</button>
                          <span style={{ fontSize: 11.5, color: MUTE }}>Ctrl+Enter</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {everyRejected && (
                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', background: '#FBF3EF', display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>Every take of this prompt was rejected.</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button disabled={busy} onClick={() => run(() => window.api.reviewRerender(sel.entryId))} title="Send the same prompt to Dola again. Uses one render from today's cap; no Claude tokens." style={small}>Re-render same prompt</button>
                      <button disabled={busy} onClick={() => run(() => window.api.reviewRewrite(sel.entryId))} title="One Claude call rewrites the prompt from the rejection reasons and render lessons, then it is rendered. The original is marked unusable." style={{ ...small, color: ACCENT, borderColor: ACCENT }}>{busy ? 'Working…' : 'Rewrite with lessons & render'}</button>
                      <button disabled={busy} onClick={() => run(() => window.api.reviewUnusable(sel.entryId))} style={{ ...small, color: MUTE }}>Mark prompt unusable</button>
                    </div>
                  </div>
                )}

                {err && <div style={{ fontSize: 12.5, color: BAD, background: '#F6E4E1', borderRadius: 9, padding: '8px 11px' }}>{err}</div>}

                {/* What was sent */}
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: '10px 14px', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ ...lbl, marginBottom: 0 }}>What Dola was sent</div>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      {entry && <button onClick={() => onOpenEntry(entry)} style={small}>Open in lab</button>}
                      <button onClick={() => setShowPrompt((s) => !s)} style={small}>{showPrompt ? 'Hide prompt' : 'Show prompt'}</button>
                    </span>
                  </div>
                  {sel.instructions && <div style={{ fontSize: 12.5 }}><span style={{ color: ACCENT, fontWeight: 600 }}>Additional instructions: </span>{sel.instructions}</div>}
                  {showPrompt && <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, lineHeight: 1.6, background: SCREEN, color: SCREEN_TX, borderRadius: 9, padding: '10px 12px', maxHeight: 320, overflowY: 'auto' }}>{sel.prompt}</pre>}
                </div>

                {/* What the reviews say so far */}
                {stats && (stats.reasons.length > 0 || stats.scenarios.length > 0) && (
                  <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#faf9f6', padding: '10px 14px', display: 'grid', gap: 8 }}>
                    <div style={{ ...lbl, marginBottom: 0 }}>Review record</div>
                    {stats.reasons.length > 0 && <div style={{ fontSize: 12.5 }}><span style={{ color: MUTE }}>Top reject reasons: </span>{stats.reasons.slice(0, 4).map((r) => `${reasonLabel(r.reason)} (${r.n})`).join(' · ')}</div>}
                    <div style={{ display: 'grid', gap: 3 }}>
                      {stats.scenarios.slice(0, 6).map((s) => {
                        const total = s.approved + s.rejected
                        const label = entries.find((e) => e.scenarioId === s.scenario)?.scenario || s.scenario
                        return (
                          <div key={s.scenario} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 60px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                            <span style={{ height: 6, background: '#EEEAE1', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                              <span style={{ width: `${(s.approved / total) * 100}%`, background: GOOD }} />
                              <span style={{ width: `${(s.rejected / total) * 100}%`, background: BAD }} />
                            </span>
                            <span style={{ color: MUTE, fontVariantNumeric: 'tabular-nums' }}>{s.approved}✓ {s.rejected}✗</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: WAIT }}>Approved takes move to <code>approved\</code>, rejected to <code>rejected\</code> inside the video folder. Undo moves them back.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
