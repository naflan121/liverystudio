import { useEffect, useMemo, useState } from 'react'
import { INK, MUTE, LINE, SURFACE, INFO, GOOD, BAD, DISPLAY, MONO, lbl } from '../ui'
import { reasonLabel } from '@shared/review'
import type { Entry, UsageRow } from '@shared/types'

// What each CLI call label is for, in words you'd use.
const CATEGORY: Record<string, string> = {
  prompt: 'Writing prompts', rewrite: 'Writing prompts', candidates: 'Writing prompts', title: 'Writing prompts',
  learn: 'Learning (playbook)', redistill: 'Learning (playbook)',
  'render-lessons': 'Render review', 'fix-prompt': 'Render review',
  'ref-aircraft': 'Reference images', scene: 'Coverage (aircraft + setting)', backfill: 'Coverage (aircraft + setting)',
  precheck: 'AI pre-check (video)', test: 'Connection tests',
  trends: 'Trend research', concept: 'Concepts', caption: 'Captions',
}
const category = (label: string): string => CATEGORY[label] || 'Other'

const money = (n: number): string => (n >= 10 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`)
const tokens = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: MUTE, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: INK }}>{value}</span>
      {sub && <span style={{ fontSize: 11.5, color: MUTE }}>{sub}</span>}
    </div>
  )
}

/** Usage meter: today's API-equivalent cost + tokens, by activity, and the last 14 days. */
export function UsageCard() {
  const [data, setData] = useState<{ today: UsageRow[]; byDay: UsageRow[]; byModelToday: UsageRow[]; byProviderToday?: UsageRow[] } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const load = (): void => { window.api.usageSummary(14).then((d) => { if (alive) setData(d) }).catch(() => { /* ignore */ }) }
    load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const cats = useMemo(() => {
    const m = new Map<string, UsageRow>()
    for (const r of data?.today || []) {
      const k = `${category(r.key)}${r.provider === 'minimax' ? ' · MiniMax' : ''}`
      const c = m.get(k) || { key: k, calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0 }
      c.calls += r.calls; c.costUsd += r.costUsd; c.inputTokens += r.inputTokens; c.outputTokens += r.outputTokens; c.cacheTokens += r.cacheTokens
      m.set(k, c)
    }
    return [...m.values()].sort((a, b) => b.costUsd - a.costUsd)
  }, [data])

  // Fill the last 14 days so empty days show as gaps, not missing bars.
  const days = useMemo(() => {
    const byKey = new Map((data?.byDay || []).map((r) => [r.key, r]))
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86400000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { key, date: d, row: byKey.get(key) }
    })
  }, [data])

  const total = cats.reduce((a, c) => ({ cost: a.cost + c.costUsd, calls: a.calls + c.calls, tok: a.tok + c.inputTokens + c.outputTokens + c.cacheTokens }), { cost: 0, calls: 0, tok: 0 })
  const week = days.slice(-7).reduce((a, d) => a + (d.row?.costUsd || 0), 0)
  const max = Math.max(0.0001, ...days.map((d) => d.row?.costUsd || 0))
  const W = 560, H = 120, pad = { l: 46, r: 6, t: 8, b: 20 }
  const bw = (W - pad.l - pad.r) / days.length
  const ticks = [0, max / 2, max]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <Stat label="Today" value={money(total.cost)} sub="API-equivalent" />
        <Stat label="Calls today" value={String(total.calls)} sub={`${tokens(total.tok)} tokens`} />
        <Stat label="Last 7 days" value={money(week)} sub="API-equivalent" />
      </div>

      <div>
        <div style={{ ...lbl, marginBottom: 4 }}>Last 14 days · cost per day</div>
        <div style={{ position: 'relative', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: W }} onMouseLeave={() => setHover(null)} role="img" aria-label="Claude usage cost per day, last 14 days">
            {ticks.map((t, i) => {
              const y = pad.t + (H - pad.t - pad.b) * (1 - t / max)
              return (
                <g key={i}>
                  <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray={i === 0 ? undefined : '2 3'} />
                  <text x={pad.l - 5} y={y + 3} textAnchor="end" fontSize="9" fill="var(--mute)" fontFamily="var(--f-mono)">{money(t)}</text>
                </g>
              )
            })}
            {days.map((d, i) => {
              const v = d.row?.costUsd || 0
              const h = Math.max(v > 0 ? 2 : 0, (H - pad.t - pad.b) * (v / max))
              const x = pad.l + i * bw + 2
              const w = Math.max(2, bw - 4)
              const y = H - pad.b - h
              const isToday = i === days.length - 1
              return (
                <g key={d.key} onMouseEnter={() => setHover(i)}>
                  <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                  {h > 0 && <path d={`M${x},${y + h} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, w / 2)},${y} H${x + w - Math.min(4, w / 2)} Q${x + w},${y} ${x + w},${y + Math.min(4, h)} V${y + h} Z`}
                    fill={isToday ? 'var(--accent)' : 'var(--info)'} opacity={hover === null || hover === i ? 1 : 0.45} />}
                  {(i % 2 === 1 || isToday) && <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--mute)" fontFamily="var(--f-mono)">{isToday ? 'today' : d.date.getDate()}</text>}
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div style={{ position: 'absolute', top: 0, left: `min(${((pad.l + hover * bw + bw / 2) / W) * 100}%, calc(100% - 170px))`, transform: 'translateX(-10%)', pointerEvents: 'none', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 9px', fontSize: 11.5, boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
              <div style={{ fontWeight: 600 }}>{days[hover].date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              <div style={{ color: MUTE }}>{money(days[hover].row?.costUsd || 0)} · {days[hover].row?.calls || 0} calls · {tokens((days[hover].row?.inputTokens || 0) + (days[hover].row?.outputTokens || 0) + (days[hover].row?.cacheTokens || 0))} tokens</div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={{ ...lbl, marginBottom: 6 }}>Today by activity</div>
        {cats.length === 0
          ? <div style={{ fontSize: 12.5, color: MUTE }}>No Claude calls recorded today yet. Every prompt, learning step and review adds a row here.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: MUTE, textAlign: 'left' }}>
                  <th style={{ fontWeight: 600, padding: '4px 0' }}>Activity</th>
                  <th style={{ fontWeight: 600, textAlign: 'right' }}>Calls</th>
                  <th style={{ fontWeight: 600, textAlign: 'right' }}>Tokens</th>
                  <th style={{ fontWeight: 600, textAlign: 'right' }}>Cost</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {cats.map((c) => (
                  <tr key={c.key} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ padding: '5px 0' }}>{c.key}</td>
                    <td style={{ textAlign: 'right', fontFamily: MONO }}>{c.calls}</td>
                    <td style={{ textAlign: 'right', fontFamily: MONO }}>{tokens(c.inputTokens + c.outputTokens + c.cacheTokens)}</td>
                    <td style={{ textAlign: 'right', fontFamily: MONO }}>{money(c.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {(data?.byProviderToday?.length || 0) > 0 && (
          <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6 }}>By engine today: {data!.byProviderToday!.map((p) => `${p.key === 'minimax' ? 'MiniMax' : 'Claude'} ${p.calls} calls · ${tokens(p.inputTokens + p.outputTokens + p.cacheTokens)} tokens${p.key === 'claude' ? ` · ${money(p.costUsd)}` : ' (plan)'}`).join('  ·  ')}</div>
        )}
        {(data?.byModelToday.length || 0) > 0 && (
          <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6 }}>By model today: {data!.byModelToday.map((m) => `${m.key.replace(/^claude-/, '')} ${money(m.costUsd)}`).join(' · ')}</div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.5 }}>
        Claude figures are what the Claude CLI reports per call — on a subscription, read them as the API-equivalent value. MiniMax calls count tokens against your MiniMax plan (no dollar figure), so the cost chart covers Claude only.
      </div>
    </div>
  )
}

/** Review record: what gets rejected and which formats Dola renders reliably. */
export function ReviewRecordCard({ entries }: { entries: Entry[] }) {
  const [stats, setStats] = useState<{ scenarios: { scenario: string; approved: number; rejected: number }[]; reasons: { reason: string; n: number }[] } | null>(null)
  const [agree, setAgree] = useState<{ compared: number; agreed: number; falseRejects: number; missedRejects: number } | null>(null)
  useEffect(() => { window.api.reviewStats().then(setStats).catch(() => { /* ignore */ }); window.api.precheckAgreement().then(setAgree).catch(() => { /* ignore */ }) }, [])
  const label = (id: string): string => entries.find((e) => e.scenarioId === id)?.scenario || id
  if (!stats) return <div style={{ fontSize: 12.5, color: MUTE }}>Loading…</div>
  const reviewed = stats.scenarios.reduce((a, s) => a + s.approved + s.rejected, 0)
  const approved = stats.scenarios.reduce((a, s) => a + s.approved, 0)
  if (!reviewed) return <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.5 }}>Nothing reviewed yet. Approve or reject renders in Review and the record builds up here.</div>
  const maxReason = Math.max(1, ...stats.reasons.map((r) => r.n))
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <Stat label="Reviewed" value={String(reviewed)} sub="approved + rejected" />
        <Stat label="Approval rate" value={`${Math.round((approved / reviewed) * 100)}%`} sub={`${approved} approved`} />
        <Stat label="AI agrees with you" value={agree && agree.compared ? `${Math.round((agree.agreed / agree.compared) * 100)}%` : '—'} sub={agree && agree.compared ? `${agree.agreed} of ${agree.compared} · ${agree.falseRejects} false rejects` : 'no pre-checked decisions yet'} />
      </div>
      {stats.reasons.length > 0 && (
        <div>
          <div style={{ ...lbl, marginBottom: 6 }}>Why renders get rejected</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {stats.reasons.map((r) => (
              <div key={r.reason} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 200px) 1fr 28px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reasonLabel(r.reason)}</span>
                <span style={{ height: 8, background: 'var(--track)', borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.n / maxReason) * 100}%`, background: BAD, borderRadius: 4 }} /></span>
                <span style={{ fontFamily: MONO, color: MUTE, textAlign: 'right' }}>{r.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={{ ...lbl, marginBottom: 6 }}>By scenario · approved vs rejected</div>
        <div style={{ display: 'grid', gap: 5 }}>
          {stats.scenarios.filter((s) => s.approved + s.rejected > 0).map((s) => {
            const t = s.approved + s.rejected
            return (
              <div key={s.scenario} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 200px) 1fr 64px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(s.scenario)}</span>
                <span style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 2, background: 'var(--track)' }}>
                  {s.approved > 0 && <span style={{ width: `${(s.approved / t) * 100}%`, background: GOOD, borderRadius: 4 }} />}
                  {s.rejected > 0 && <span style={{ width: `${(s.rejected / t) * 100}%`, background: BAD, borderRadius: 4 }} />}
                </span>
                <span style={{ fontFamily: MONO, color: MUTE, textAlign: 'right' }}>{s.approved}✓ {s.rejected}✗</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: MUTE, marginTop: 8 }}>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: GOOD, marginRight: 5 }} />Approved</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: BAD, marginRight: 5 }} />Rejected</span>
          <span style={{ color: INFO }}>Skipped takes aren't counted.</span>
        </div>
      </div>
    </div>
  )
}
