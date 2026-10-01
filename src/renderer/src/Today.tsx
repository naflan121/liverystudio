import { useEffect, useMemo, useState } from 'react'
import { DISPLAY, MONO, INK, MUTE, LINE, SURFACE, ACCENT, INFO, GOOD, BAD, WARN, ghostBtn } from './ui'
import { PageHeader, type View } from './Shell'
import { RENDER_META } from './Renders'
import { snippet } from '@shared/util'
import { topInsights } from '@shared/brain'
import type { Entry, RenderJob, RenderOverview } from '@shared/types'

const small = { ...ghostBtn, padding: '4px 10px', fontSize: 12 }

function isToday(iso?: string): boolean {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}
function minutesSince(iso?: string): string {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/** One status tile: the number is the point; the label says what it counts. */
function Tile({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone?: 'info' | 'good' | 'bad' | 'none'; onClick?: () => void }) {
  const color = tone === 'info' ? INFO : tone === 'good' ? GOOD : tone === 'bad' ? BAD : INK
  return (
    <button onClick={onClick} disabled={!onClick} style={{ textAlign: 'left', cursor: onClick ? 'pointer' : 'default', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px 12px', display: 'grid', gap: 2, color: INK, minWidth: 0 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 12.5, letterSpacing: 1.8, textTransform: 'uppercase', color: MUTE, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 700, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 12, color: MUTE, minHeight: 16 }}>{sub || ''}</span>
    </button>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, alignContent: 'start', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ title, meta, right, onClick }: { title: string; meta: React.ReactNode; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', borderTop: `1px solid ${LINE}` }}>
      <div onClick={onClick} style={{ flex: 1, minWidth: 0, cursor: onClick ? 'pointer' : 'default' }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>
      </div>
      {right}
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 12.5, color: MUTE, padding: '6px 2px', lineHeight: 1.5 }}>{children}</div>

export function Today({ entries, jobs, overview, onNav, onOpenEntry, onLineup }: {
  onLineup: () => void
  entries: Entry[]
  jobs: RenderJob[]
  overview: RenderOverview | null
  onNav: (v: View) => void
  onOpenEntry: (h: Entry) => void
}) {
  const [copied, setCopied] = useState('')
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const writtenToday = entries.filter((e) => isToday(e.ts)).length
  const live = jobs.filter((j) => RENDER_META[j.status].live)
  const sending = live.filter((j) => j.status !== 'queued')
  const awaiting = jobs.filter((j) => j.status === 'done' && j.file && !j.review).reverse()
  const readyToPost = jobs.filter((j) => j.review?.verdict === 'approved' && byId.get(j.entryId)?.status === 'queued')
  const toScore = entries.filter((e) => e.status === 'posted')
  const failedToday = jobs.filter((j) => j.status === 'failed' && isToday(j.endedAt)).length
  const insights = useMemo(() => topInsights(entries), [entries])
  // Brain agent digest (Phase 2+): manual trigger + live updates from the reactive/periodic runs.
  const [digest, setDigest] = useState<any | null>(null)
  const [digestBusy, setDigestBusy] = useState(false)
  const [digestErr, setDigestErr] = useState('')
  useEffect(() => window.api.onBrainDigest((d) => setDigest(d)), [])
  async function runBrainAgent(apply: boolean) {
    setDigestBusy(true); setDigestErr('')
    try { const d = await window.api.brainDigest({ apply }); setDigest(d) }
    catch (e: any) { setDigestErr(String(e?.message || e)) }
    finally { setDigestBusy(false) }
  }
  const cap = overview?.dailyCap ?? 0
  const sent = overview?.sentToday ?? 0

  const now = new Date()
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  function copy(text: string, key: string): void {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1200) }).catch(() => { /* ignore */ })
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 32px', display: 'grid', gap: 18 }}>
      <PageHeader eyebrow={dateLine} title="Today">
        <button onClick={onLineup} style={{ ...ghostBtn, background: ACCENT, color: '#fff', border: 'none' }}>Batch lineup</button>
        <button onClick={() => onNav('lab')} style={ghostBtn}>New prompt</button>
        <button onClick={() => onNav('renders')} style={ghostBtn}>Render ready prompts</button>
      </PageHeader>

      {overview?.paused && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid var(--warn)', background: 'var(--surface)', borderRadius: 12, padding: '10px 14px' }}>
            <span style={{ fontFamily: 'var(--f-display)', fontSize: 15, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--warn)' }}>Sending paused</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--ink)' }}>{overview?.paused.reason} <span style={{ color: 'var(--mute)' }}>Videos already sent keep generating and downloading.</span></span>
            <button onClick={() => window.api.renderResume()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Resume sending</button>
          </div>
        )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Tile label="Written today" value={String(writtenToday)} sub="prompts from the brain" onClick={() => onNav('history')} />
        <Tile label="Sent today" value={`${sent}`} sub={`of ${cap} daily cap${failedToday ? ` · ${failedToday} failed` : ''}`} tone={failedToday ? 'bad' : 'none'} onClick={() => onNav('renders')} />
        <Tile label="In the air" value={String(sending.length)} sub={live.length - sending.length ? `${live.length - sending.length} queued` : 'rendering on Dola'} tone={sending.length ? 'info' : 'none'} onClick={() => onNav('renders')} />
        <Tile label="Awaiting review" value={String(awaiting.length)} sub="needs your verdict" tone={awaiting.length ? 'info' : 'none'} onClick={() => onNav('review')} />
        <Tile label="Ready to post" value={String(readyToPost.length)} sub="approved, not posted" tone={readyToPost.length ? 'good' : 'none'} onClick={() => onNav('review')} />
        <Tile label="To score" value={String(toScore.length)} sub="posted, waiting for results" onClick={() => onNav('history')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 12, alignItems: 'start' }}>
        <Section title="Needs you" action={awaiting.length > 0 && <button onClick={() => onNav('review')} style={small}>Open review</button>}>
          {awaiting.length === 0
            ? <Empty>Nothing waiting for review. Finished renders land here.</Empty>
            : awaiting.slice(0, 6).map((j) => (
              <Row key={j.id} title={j.title} onClick={() => onNav('review')}
                meta={<>{byId.get(j.entryId)?.scenario || '—'} · rendered {minutesSince(j.endedAt)} ago on {j.instanceName || '?'}</>}
                right={<span style={{ fontSize: 11.5, color: INFO, fontWeight: 600, whiteSpace: 'nowrap' }}>Awaiting review</span>} />
            ))}
        </Section>

        <Section title="In the air" action={live.length > 0 && <button onClick={() => onNav('renders')} style={small}>Renders</button>}>
          {live.length === 0
            ? <Empty>Nothing rendering. Pick prompts under Renders, or tick auto-render in Settings.</Empty>
            : live.slice(0, 6).map((j) => (
              <Row key={j.id} title={j.title}
                meta={<>{j.instanceName ? `${j.instanceName} · ` : ''}{j.note || (j.sentAt ? `sent ${minutesSince(j.sentAt)} ago` : 'waiting for an account')}</>}
                right={<span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', color: RENDER_META[j.status].color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: RENDER_META[j.status].color, animation: j.status !== 'queued' ? 'll-pulse 1.4s ease-in-out infinite' : undefined }} />{RENDER_META[j.status].label}</span>} />
            ))}
        </Section>

        <Section title="Ready to post">
          {readyToPost.length === 0
            ? <Empty>Approved clips you haven't posted yet show up here, with their title ready to copy.</Empty>
            : readyToPost.slice(0, 6).map((j) => {
              const e = byId.get(j.entryId)
              return (
                <Row key={j.id} title={j.title} onClick={e ? () => onOpenEntry(e) : undefined}
                  meta={<>{e?.scenario || '—'} · approved {minutesSince(j.review?.at)} ago</>}
                  right={<span style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => copy(j.title, j.id)} style={small}>{copied === j.id ? 'Copied' : 'Copy title'}</button>
                    {j.file && <button onClick={() => window.api.renderShowFile(j.file!)} style={small}>Show file</button>}
                  </span>} />
              )
            })}
        </Section>

        <Section title="Brain says">
          {insights.length === 0
            ? <Empty>Score a few posted clips and the brain's strongest signals show up here.</Empty>
            : insights.map((line, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5, padding: '6px 2px', borderTop: `1px solid ${LINE}` }}>{line}</div>)}
          {toScore.length > 0 && (
            <div style={{ fontSize: 12, color: WARN, paddingTop: 4 }}>
              {toScore.length} posted clip{toScore.length === 1 ? '' : 's'} not scored yet — scoring is what keeps the playbook learning.
              {' '}<button onClick={() => onOpenEntry(toScore[0])} style={{ ...small, marginLeft: 4 }}>Score “{snippet(toScore[0].title || toScore[0].text).slice(0, 28)}…”</button>
            </div>
          )}
        </Section>

        <Section title="Brain agent" action={
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={digestBusy} onClick={() => runBrainAgent(false)} style={small}>{digestBusy ? 'Thinking…' : '🧠 Run digest'}</button>
            {digest?.newLessons?.length ? <button disabled={digestBusy} onClick={() => runBrainAgent(true)} title="Insert these as new pending rules. Approve in Settings → Review to make them active." style={{ ...small, color: GOOD }}>Apply {digest.newLessons.length}</button> : null}
          </div>
        }>
          {digestErr && <div style={{ fontSize: 12, color: BAD, padding: '6px 2px' }}>{digestErr}</div>}
          {!digest && <Empty>The brain agent audits lessons, clusters failures and finds missed combos. Hit <strong>Run digest</strong> any time — it runs in the background on MiniMax and never fights your active work. Auto-fires every few days if you don't touch it.</Empty>}
          {digest && (
            <div style={{ display: 'grid', gap: 8, padding: '6px 2px' }}>
              <div style={{ fontSize: 12, color: MUTE }}>Last digest: <strong>{digest.source || 'manual'}</strong> · {digest.summary}</div>
              {digest.newLessons?.length > 0 && (
                <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>New rule proposals ({digest.newLessons.length})</div>
                  {digest.newLessons.slice(0, 4).map((p: any, i: number) => (
                    <div key={i} style={{ fontSize: 12.5, padding: '4px 0', lineHeight: 1.5 }}>· {p.rule}{p.category ? <span style={{ color: MUTE }}> ({p.category})</span> : null}</div>
                  ))}
                </div>
              )}
              {digest.clusters?.length > 0 && (
                <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Failure clusters ({digest.clusters.length})</div>
                  {digest.clusters.slice(0, 3).map((c: any, i: number) => (
                    <div key={i} style={{ fontSize: 12.5, padding: '4px 0', lineHeight: 1.5 }}>· <strong>{c.scenarioId || '?'}</strong> · {c.reason} · {c.momentBucket} · {c.count}× — {c.proposedRule}</div>
                  ))}
                </div>
              )}
              {digest.missedCombos?.length > 0 && (
                <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Untried winning combos</div>
                  {digest.missedCombos.slice(0, 3).map((m: any, i: number) => (
                    <div key={i} style={{ fontSize: 12.5, padding: '4px 0', lineHeight: 1.5 }}>· {m.rationale}</div>
                  ))}
                </div>
              )}
              {digest.health && (
                <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 6, fontSize: 11.5, color: MUTE }}>
                  Health: {digest.health.activeCount} active · {digest.health.pendingCount} pending · {digest.health.staleCandidates?.length ? `${digest.health.staleCandidates.length} stale candidate(s) to dismiss` : 'no stale rules'}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, color: MUTE }}>
        {entries.length} prompts in the brain · {jobs.filter((j) => j.status === 'done').length} videos rendered · {jobs.filter((j) => j.review?.verdict === 'approved').length} approved
      </div>
    </div>
  )
}
