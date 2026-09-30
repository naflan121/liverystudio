import { useState } from 'react'
import { INK, LINE, MUTE, ACCENT, INFO, GOOD, BAD, WAIT, SURFACE, DISPLAY, MONO, lbl, sel, ghostBtn } from '../ui'
import { groupScenarios } from '@shared/domain'
import { hasSnippet, toggleSnippet } from '@shared/snippets'
import type { AppConfig, Entry } from '@shared/types'
import type { LabState, LineupItem } from './useLab'

const STATUS: Record<LineupItem['status'], { label: string; color: string }> = {
  waiting: { label: 'Waiting', color: WAIT },
  writing: { label: 'Writing…', color: INFO },
  written: { label: 'Written', color: GOOD },
  queued: { label: 'Queued for render', color: GOOD },
  failed: { label: 'Failed', color: BAD },
  skipped: { label: 'Stopped', color: MUTE },
}

/** Batch lineup: write N prompts in one go and queue them for rendering. */
export function LineupPanel({ lab, config, history, capLeft, dailyCap }: {
  lab: LabState
  config: AppConfig
  history: Entry[]
  /** Renders still allowed today under the daily cap (null = unknown). */
  capLeft: number | null
  dailyCap: number
}) {
  const { lineup, runLineup, stopLineup, setLineupOpen, scenario, explore, savedConcepts, openEntry, setLineup } = lab
  const [count, setCount] = useState(() => (capLeft ? Math.min(10, capLeft) : 5)) // cap used up → a normal lineup that renders tomorrow
  const [mix, setMix] = useState(scenario || 'random')
  const [direction, setDirection] = useState('')
  const [render, setRender] = useState(true)
  const [refs, setRefs] = useState(config.render?.referenceImages !== false)
  const running = !!lineup?.running
  const exploreLabel = explore < 34 ? 'proven' : explore > 66 ? 'experimental' : 'balanced'
  const done = lineup ? lineup.items.filter((i) => i.status === 'written' || i.status === 'queued').length : 0

  const byId = new Map(history.map((h) => [h.id, h]))

  return (
    <div style={{ border: `1px solid ${ACCENT}`, borderRadius: 14, background: SURFACE, padding: '14px 16px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', margin: 0 }}>Batch lineup</h2>
        {lineup && <span style={{ fontSize: 12.5, color: running ? INFO : MUTE }}>{running ? `writing ${Math.min(done + 1, lineup.total)} of ${lineup.total}…` : `${done} of ${lineup.total} done`}</span>}
        <button onClick={() => { setLineupOpen(false); if (!running) setLineup(null) }} aria-label="Close" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: MUTE, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {!running && (
        <>
          <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.55 }}>
            The brain writes the prompts one after another using your current levers (aircraft, crowd, camera, hook, long prompt…). Keep working meanwhile — it runs in the background, about a minute per prompt.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <div style={lbl}>How many</div>
              <input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Math.min(30, Math.round(+e.target.value || 1))))} style={{ ...sel, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11.5, color: capLeft !== null && render && count > capLeft ? BAD : MUTE, marginTop: 4 }}>
                {capLeft === null ? 'Daily cap unknown (Dola offline?).' : `${capLeft} of ${dailyCap} renders left today.`}{capLeft !== null && render && count > capLeft ? ` ${count - capLeft} will wait until tomorrow.` : ''}
              </div>
            </div>
            <div>
              <div style={lbl}>Mix</div>
              <select value={mix} onChange={(e) => setMix(e.target.value)} style={sel}>
                <option value="random">Random mix — weighted by what works ({exploreLabel})</option>
                {groupScenarios().map(([group, items]) => group === ''
                  ? items.filter((s) => s.id !== 'random').map((s) => <option key={s.id} value={s.id}>All: {s.label}</option>)
                  : <optgroup key={group} label={group}>{items.map((s) => <option key={s.id} value={s.id}>All: {s.label}</option>)}</optgroup>)}
                {savedConcepts.length > 0 && <optgroup label="AI Concepts (saved)">{savedConcepts.map((c) => <option key={c.id} value={`concept:${c.id}`}>All: {c.label}</option>)}</optgroup>}
              </select>
              <div style={{ fontSize: 11.5, color: MUTE, marginTop: 4 }}>Random uses the Exploration slider: proven formats most, a few experiments.</div>
            </div>
          </div>
          <div>
            <div style={lbl}>Direction for every prompt (optional)</div>
            <input value={direction} onChange={(e) => setDirection(e.target.value)} placeholder="e.g. golden hour — leave empty for maximum variety" style={{ ...sel, boxSizing: 'border-box' }} />
            {(config.directionSnippets || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                {(config.directionSnippets || []).map((s) => {
                  const on = hasSnippet(direction, s)
                  return <button key={s} onClick={() => setDirection(toggleSnippet(direction, s))} style={{ borderRadius: 20, padding: '3px 10px', fontSize: 12, cursor: 'pointer', border: `1px solid ${on ? ACCENT : LINE}`, background: on ? 'var(--accent-soft)' : SURFACE, color: on ? ACCENT : INK, fontWeight: on ? 600 : 500 }}>{on ? '✓ ' : '+ '}{s}</button>
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
              <input type="checkbox" checked={render} onChange={(e) => setRender(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT }} /> Render them straight away
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, opacity: render ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!render} checked={refs} onChange={(e) => setRefs(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT }} /> Reference images
            </label>
          </div>
          <div>
            <button onClick={() => runLineup({ count, scenarioId: mix, direction, render, references: refs })} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              Write {count} prompt{count === 1 ? '' : 's'}{render ? ' and render' : ''}
            </button>
          </div>
        </>
      )}

      {lineup && (
        <div style={{ display: 'grid', gap: 0, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
          {lineup.items.map((it, i) => {
            const st = STATUS[it.status]
            const entry = it.entryId ? byId.get(it.entryId) : undefined
            return (
              <div key={it.n} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderTop: i ? `1px solid ${LINE}` : 'none', fontSize: 12.5 }}>
                <span style={{ fontFamily: MONO, color: MUTE }}>{it.n}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry
                    ? <button onClick={() => openEntry(entry)} title="Open this prompt" style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }}>{it.title}</button>
                    : <span style={{ color: it.scenario ? INK : MUTE }}>{it.title || it.scenario || '—'}</span>}
                  {it.scenario && entry && <span style={{ color: MUTE }}> · {it.scenario}</span>}
                  {it.error && <span style={{ color: BAD }}> · {it.error}</span>}
                </span>
                <span style={{ color: st.color, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {it.status === 'writing' && <span style={{ width: 9, height: 9, borderRadius: '50%', border: `2px solid ${LINE}`, borderTopColor: INFO, animation: 'll-spin .8s linear infinite' }} />}
                  {st.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {running && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={stopLineup} style={{ ...ghostBtn, color: MUTE }}>Stop after this one</button>
          <span style={{ fontSize: 12, color: MUTE }}>You can leave this screen — the lineup keeps going.</span>
        </div>
      )}
      {lineup && !running && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setLineup(null)} style={ghostBtn}>New lineup</button>
        </div>
      )}
    </div>
  )
}
