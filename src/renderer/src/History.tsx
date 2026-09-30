import { useMemo, useState } from 'react'
import { INK, PAPER, LINE, MUTE, ACCENT, WAIT, ghostBtn, sel, eyebrow, pageTitle } from './ui'
import { REACH } from '@shared/domain'
import { snippet } from '@shared/util'
import type { Entry, ReachId } from '@shared/types'

function statusMeta(h: Entry) {
  if (h.status === 'scored') { const r = REACH.find((x) => x.id === h.reach); return { label: r ? r.label : 'Scored', color: r ? r.color : 'var(--good)' } }
  if (h.status === 'posted') return { label: 'Posted', color: ACCENT }
  if (h.status === 'skipped') return { label: 'Skipped', color: MUTE }
  return { label: 'Awaiting', color: WAIT }
}
function ago(h: Entry) {
  const d = Math.floor((Date.now() - new Date(h.ts).getTime()) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 7) return d + ' days ago'
  const w = Math.floor(d / 7)
  return w + (w === 1 ? ' week ago' : ' weeks ago')
}

export function History({ entries, openId, onOpen, onClose }: {
  entries: Entry[]
  openId: number | null
  onOpen: (h: Entry) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('all')
  const [reachFilter, setReachFilter] = useState<ReachId | 'any'>('any')
  const [q, setQ] = useState('')

  const counts = useMemo(() => ({
    toscore: entries.filter((h) => h.status === 'queued' || h.status === 'posted').length,
    scored: entries.filter((h) => h.status === 'scored').length,
    skipped: entries.filter((h) => h.status === 'skipped').length,
    all: entries.length,
  }), [entries])

  const results = useMemo(() => {
    let out = entries
    if (filter === 'toscore') out = out.filter((h) => h.status === 'queued' || h.status === 'posted')
    else if (filter === 'scored') out = out.filter((h) => h.status === 'scored')
    else if (filter === 'skipped') out = out.filter((h) => h.status === 'skipped')
    if (reachFilter !== 'any') out = out.filter((h) => h.reach === reachFilter)
    const needle = q.trim().toLowerCase()
    if (needle) {
      out = out.filter((h) => {
        if ((h.title || '').toLowerCase().includes(needle)) return true
        if ((h.nudge || '').toLowerCase().includes(needle)) return true
        // Titles are missing on some older/untitled entries — fall back to the
        // prompt text itself so nothing generated becomes unsearchable.
        return !h.title && h.text.toLowerCase().includes(needle)
      })
    }
    return out
  }, [entries, filter, reachFilter, q])

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK, fontFamily: 'var(--f-body)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={eyebrow}>History</div>
            <h1 style={{ ...pageTitle, marginTop: 2 }}>Previous prompts</h1>
          </div>
          
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title or direction…"
            style={{ ...sel, flex: '1 1 260px', boxSizing: 'border-box' }}
          />
          <select value={reachFilter} onChange={(e) => setReachFilter(e.target.value as ReachId | 'any')} style={{ ...sel, width: 'auto', minWidth: 140 }}>
            <option value="any">Any result</option>
            {REACH.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {[['toscore', 'To score'], ['scored', 'Scored'], ['skipped', 'Skipped'], ['all', 'All']].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} style={{ borderRadius: 20, padding: '5px 13px', fontSize: 12.5, cursor: 'pointer', fontWeight: filter === id ? 600 : 400, border: `1px solid ${filter === id ? ACCENT : LINE}`, background: filter === id ? 'var(--accent-soft)' : 'var(--surface)', color: filter === id ? ACCENT : INK }}>{label} {counts[id] || 0}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTE, alignSelf: 'center' }}>{results.length} of {entries.length}</span>
        </div>

        {results.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTE, padding: '30px 0', textAlign: 'center' }}>
            {q.trim() ? `No prompts match “${q.trim()}”.` : 'Nothing here yet.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
            {results.map((h) => {
              const m = statusMeta(h)
              const open = openId === h.id
              return (
                <button key={h.id} onClick={() => onOpen(h)} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${open ? ACCENT : LINE}`, background: open ? 'var(--accent-soft)' : 'var(--surface)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || snippet(h.text)}</span>
                    <span style={{ fontSize: 12, color: MUTE, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.scenario}{h.hook ? ' · hook' : ''}{h.multiShot ? ' · multi' : ''}</span>
                    {h.nudge && <span style={{ fontSize: 11.5, color: ACCENT, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↳ {h.nudge}</span>}
                  </span>
                  <span style={{ fontSize: 11, textAlign: 'right', flexShrink: 0, color: MUTE }}>
                    <span style={{ display: 'block', color: m.color, fontWeight: 600 }}>{m.label}</span>
                    <span>{ago(h)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
