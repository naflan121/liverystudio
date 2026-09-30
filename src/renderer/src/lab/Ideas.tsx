import { INK, LINE, MUTE, ACCENT, INFO, GOOD, SURFACE, DISPLAY, MONO, ghostBtn } from '../ui'
import type { LabState } from './useLab'

/** Concept brainstorm results: ranked ideas to generate from or save to the concept library. */
export function IdeasPanel({ lab }: { lab: LabState }) {
  const { ideas, brainstorming, brainstorm, generateIdea, saveIdea, setIdeasOpen, loading } = lab
  return (
    <div style={{ border: `1px solid ${ACCENT}`, borderRadius: 14, background: SURFACE, padding: '14px 16px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', margin: 0 }}>Concept brainstorm</h2>
        {brainstorming && <span style={{ fontSize: 12.5, color: INFO }}>thinking on the learning model…</span>}
        <button onClick={() => setIdeasOpen(false)} aria-label="Close" style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: MUTE, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.55 }}>
        Ranked best first. Ideas only borrow from a format when your scores prove it (3+ scored clips) — see <em>Borrows</em>. Save the ones you like to reuse them in Scenario or a lineup.
      </div>
      {!brainstorming && !ideas.length && <div style={{ fontSize: 13, color: MUTE }}>No ideas yet.</div>}
      {ideas.map((i, k) => (
        <div key={i.label + k} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, color: MUTE, fontSize: 12 }}>{k + 1}</span>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: INK }}>{i.label}</span>
            {i.score && <span style={{ fontFamily: MONO, fontSize: 11.5, color: MUTE }}>{i.score}</span>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>{i.brief}</div>
          {i.hook && <div style={{ fontSize: 12.5 }}><strong>Hook:</strong> {i.hook}</div>}
          {i.why && <div style={{ fontSize: 12.5, color: MUTE }}><strong>Why it could spread:</strong> {i.why}</div>}
          <div style={{ fontSize: 12, color: /^none/i.test(i.borrows) ? MUTE : GOOD }}><strong>Borrows:</strong> {i.borrows}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => generateIdea(i)} disabled={loading} style={{ ...ghostBtn, color: ACCENT, borderColor: ACCENT, opacity: loading ? 0.6 : 1 }}>Generate from this</button>
            <button onClick={() => saveIdea(i)} style={ghostBtn}>💾 Save concept</button>
          </div>
        </div>
      ))}
      {!brainstorming && (
        <div><button onClick={() => brainstorm(5)} style={ghostBtn}>{ideas.length ? 'Brainstorm again' : 'Brainstorm 5 ideas'}</button></div>
      )}
    </div>
  )
}
