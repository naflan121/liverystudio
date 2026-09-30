import {
  INK, PAPER, LINE, MUTE, ACCENT, INFO, GOOD, BAD, VIRAL, WAIT, SCREEN, SCREEN_TX, lbl, sel, ghostBtn, primaryBtn, card,
} from '../ui'
import { REACH, ILLUSION_TAGS, AIRCRAFT, CAMERA, CROWD, ENV, REGION, groupScenarios } from '@shared/domain'
import { snippet, splitSections } from '@shared/util'
import type { AppConfig, Entry, RenderJob } from '@shared/types'
import { RenderStrip } from '../Renders'
import { PageHeader } from '../Shell'
import { CopyBtn, statusMeta, ago } from './common'
import { hasSnippet, toggleSnippet } from '@shared/snippets'
import type { LabState } from './useLab'
import { LineupPanel } from './Lineup'
import { IdeasPanel } from './Ideas'

export function Lab({ lab, config, history, playbook, latestRender, capLeft, dailyCap }: {
  capLeft: number | null
  dailyCap: number
  lab: LabState
  config: AppConfig
  history: Entry[]
  playbook: string
  latestRender: Map<number, RenderJob>
}) {
  const { lineupOpen, setLineupOpen, lineup, ideasOpen, brainstorm, brainstorming } = lab
  const { scenario, setScenario, aircraft, setAircraft, crowd, setCrowd, env, setEnv, camera, setCamera, hook, setHook, multiShot, setMultiShot, punchyOpen, setPunchyOpen, region, setRegion, varyCoverage, setVaryCoverage, useTrends, setUseTrends, boost, setBoost, longPrompt, setLongPrompt, candidateMode, setCandidateMode, candidates, setCandidates, nudge, setNudge, explore, setExplore, savedConcepts, setSavedConcepts, conceptLoading, setConceptLoading, loading, setLoading, learnCount, setLearnCount, error, setError, current, setCurrent, pickedTags, setPickedTags, comment, setComment, reachDraft, setReachDraft, viewsDraft, setViewsDraft, excludeCoverage, setExcludeCoverage, toast, setToast, captioning, setCaptioning, showLearn, setShowLearn, learning, toastTimer, flashToast, brainInsights, rated, tierCount, hookTries, hookStrong, toscoreCount, generateRef, count, charLimit, over, sections, cur, doLearn, buildEntry, buildReq, resetScoringDraft, startNew, conceptScenario, resolveScenario, autoRender, generateFrom, generate, surpriseConcept, saveThisConcept, remixWinner, chooseCandidate, openEntry, updateEntry, submitScore, patchCurrent, titleAvoidList, regenerateTitle, writeCaption } = lab
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
  const runHint = isMac ? '⌘↵' : 'Ctrl+↵'

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK }}>
      <style>{`
        .ll-wrap{max-width:1440px;margin:0 auto;padding:24px 24px 32px}
        .ll-grid{display:grid;grid-template-columns:340px minmax(0,1fr) 252px;gap:16px;align-items:start}
        @media (max-width:1400px){.ll-grid{grid-template-columns:minmax(280px,320px) minmax(0,1fr)}.ll-recent{grid-column:1 / -1 !important;position:static !important}.ll-controls{position:static !important}}
        @media (max-width:980px){.ll-grid{grid-template-columns:1fr}.ll-controls{position:static !important}}
      `}</style>
      <div className="ll-wrap">

        <div style={{ marginBottom: 16 }}>
          <PageHeader eyebrow="Create · the brain writes Seedance prompts" title="Prompt lab">
            {learning && <span style={{ color: INFO, fontSize: 12.5, fontWeight: 600 }}>teaching playbook…{learnCount > 1 ? ` (${learnCount})` : ''}</span>}
            <button onClick={() => setLineupOpen(true)} title="Write several prompts in one go and queue them for rendering" style={{ ...ghostBtn, padding: '8px 14px', color: ACCENT, borderColor: ACCENT }}>{lineup?.running ? `Batch lineup · ${lineup.items.filter((i) => i.status === 'written' || i.status === 'queued').length}/${lineup.total}` : 'Batch lineup'}</button>
            {(current || candidates.length > 0) && <button onClick={startNew} title="Clear the open prompt (and any leftover Direction from History) so you can generate a fresh one" style={{ ...ghostBtn, padding: '8px 14px' }}>New</button>}
          </PageHeader>
        </div>

        {/* Scoreboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {REACH.slice().reverse().map((r) => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: 'var(--surface)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
              <strong style={{ color: r.color }}>{tierCount(r.id)}</strong>
              <span style={{ color: MUTE }}>{r.id === 'flop' ? 'flop' : r.id === 'normal' ? 'normal' : r.id === 'good' ? 'good' : 'viral'}</span>
            </span>
          ))}
          {hookTries.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: 'var(--surface)', color: MUTE }}>hook <strong style={{ color: INK }}>{hookStrong.length}/{hookTries.length}</strong></span>}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: toscoreCount > 0 ? ACCENT : MUTE, fontWeight: 600 }}>{toscoreCount} awaiting your result</span>
        </div>

        {/* Three columns: controls · live result · recent generations */}
        <div className="ll-grid">

          {/* LEFT — controls */}
          <div className="ll-controls" style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, display: 'grid', gap: 15, background: PAPER, position: 'sticky', top: 18 }}>
            <div>
              <div style={lbl}>Scenario</div>
              <select value={scenario} onChange={(e) => setScenario(e.target.value)} style={sel}>
                {groupScenarios().map(([group, items]) => group === ''
                  ? items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)
                  : <optgroup key={group} label={group}>{items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
                {savedConcepts.length > 0 && (
                  <optgroup label="AI Concepts (saved)">
                    {savedConcepts.map((c) => <option key={c.id} value={`concept:${c.id}`}>{c.label}</option>)}
                  </optgroup>
                )}
              </select>
              <button onClick={surpriseConcept} disabled={conceptLoading} title="Ask the model to invent a brand-new one-off concept and generate from it" style={{ ...ghostBtn, marginTop: 8, width: '100%', opacity: conceptLoading ? 0.6 : 1 }}>{conceptLoading ? 'Inventing…' : '💡 Surprise concept'}</button>
              <button onClick={() => brainstorm(5)} disabled={brainstorming} title="Think harder: 5 ranked, genuinely different concepts from one call on the learning model" style={{ ...ghostBtn, marginTop: 6, width: '100%', opacity: brainstorming ? 0.6 : 1 }}>{brainstorming ? 'Brainstorming…' : '🧠 Brainstorm concepts'}</button>
            </div>

            <div><div style={lbl}>Aircraft</div><select value={aircraft} onChange={(e) => setAircraft(e.target.value)} style={sel}>{AIRCRAFT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
            <div><div style={lbl}>Crowd density</div><select value={crowd} onChange={(e) => setCrowd(e.target.value)} style={sel}>{CROWD.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div><div style={lbl}>Environment</div><select value={env} onChange={(e) => setEnv(e.target.value)} style={sel}>{ENV.map((e2) => <option key={e2.id} value={e2.id}>{e2.label}</option>)}</select></div>
            <div><div style={lbl}>Camera identity</div><select value={camera} onChange={(e) => setCamera(e.target.value)} style={sel}>{CAMERA.map((c2) => <option key={c2.id} value={c2.id}>{c2.label}</option>)}</select></div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: `1px solid ${hook ? ACCENT : LINE}`, borderRadius: 10, padding: '10px 14px', background: hook ? 'var(--accent-soft)' : 'var(--surface)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: hook ? ACCENT : INK }}>Hook mode {hook ? 'on' : 'off'}</div>
                <div style={{ fontSize: 12, color: MUTE }}>One photoreal-but-impossible detail — the "what is that?" gamble.</div>
              </div>
              <button onClick={() => setHook((h) => !h)} style={{ border: 'none', cursor: 'pointer', borderRadius: 20, width: 46, height: 26, background: hook ? ACCENT : 'var(--toggle-off)', position: 'relative', flexShrink: 0 }} aria-label="Toggle hook mode"><span style={{ position: 'absolute', top: 3, left: hook ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={multiShot} onChange={(e) => setMultiShot(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Multiple shots / angles.</span> <span style={{ color: MUTE }}>Off = one continuous take.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={punchyOpen} onChange={(e) => setPunchyOpen(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Punchy 3-sec open.</span> <span style={{ color: MUTE }}>Engineer a scroll-stopping first second.</span></span>
            </label>

            <div style={{ opacity: aircraft === 'placeholder' ? 0.5 : 1 }}>
              <div style={lbl}>Operator region</div>
              <select value={region} disabled={aircraft === 'placeholder'} onChange={(e) => setRegion(e.target.value)} style={sel}>{REGION.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              <div style={{ fontSize: 11.5, color: MUTE, marginTop: 4 }}>Hard restriction on the airline/operator's home region — steers off repeats like ANA.</div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={varyCoverage} onChange={(e) => setVaryCoverage(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Vary using coverage.</span> <span style={{ color: MUTE }}>Push to a setting not used recently (Environment = auto).</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={useTrends} onChange={(e) => setUseTrends(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Use current trends.</span> <span style={{ color: MUTE }}>Ride what's hot. Refresh the digest in Settings.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, border: `1px solid ${boost ? ACCENT : LINE}`, borderRadius: 10, padding: '9px 12px', background: boost ? 'var(--accent-soft)' : 'var(--surface)' }}>
              <input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Reach Boost 📈</span> <span style={{ color: MUTE }}>Ceiling-attempt biases from the performance report (tarmac, widebody, centerline/rotation). A/B-tracked in Settings — untick to get the exact old behavior.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={longPrompt} onChange={(e) => setLongPrompt(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Long prompt ({config.longPromptChars || 4800} chars).</span> <span style={{ color: MUTE }}>For platforms that accept long prompts — more room for physics, scale cues and negatives. Tracked, so the learner can tell if it helps.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={candidateMode} onChange={(e) => setCandidateMode(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Generate 3 to choose from.</span> <span style={{ color: MUTE }}>Slower; you pick one, the rest are discarded.</span></span>
            </label>

            <div><div style={lbl}>Exploration · {explore < 34 ? 'proven' : explore > 66 ? 'experimental' : 'balanced'}</div><input type="range" min={0} max={100} value={explore} onChange={(e) => setExplore(+e.target.value)} style={{ width: '100%', accentColor: ACCENT }} /></div>

            <div>
              <div style={lbl}>Direction for this one (optional)</div>
              <input value={nudge} onChange={(e) => setNudge(e.target.value)} placeholder="e.g. Emirates A380, dusk, packed grandstand" style={{ ...sel, boxSizing: 'border-box' }} />
              {(config.directionSnippets || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                  {(config.directionSnippets || []).map((s) => {
                    const on = hasSnippet(nudge, s)
                    return (
                      <button key={s} onClick={() => setNudge(toggleSnippet(nudge, s))} title={on ? 'Click to take it out' : 'Click to add to the direction'}
                        style={{ borderRadius: 20, padding: '3px 10px', fontSize: 12, cursor: 'pointer', border: `1px solid ${on ? ACCENT : LINE}`, background: on ? 'var(--accent-soft)' : 'var(--surface)', color: on ? ACCENT : INK, fontWeight: on ? 600 : 500 }}>
                        {on ? '✓ ' : '+ '}{s}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {brainInsights.length > 0 && (
              <div style={{ display: 'grid', gap: 4, border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 12px', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>Brain says</div>
                {brainInsights.map((line, i) => <div key={i} style={{ fontSize: 12.5, color: INK }}>{line}</div>)}
              </div>
            )}

            <div>
              <button onClick={generate} disabled={loading} style={{ ...primaryBtn, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? 'Writing…' : 'Generate prompt'}</button>
              <div style={{ textAlign: 'center', fontSize: 11.5, color: MUTE, marginTop: 6 }}>or press <kbd style={{ fontFamily: 'var(--f-mono)', background: 'var(--surface)', border: `1px solid ${LINE}`, borderRadius: 5, padding: '1px 6px' }}>{runHint}</kbd></div>
            </div>

            <button onClick={() => setShowLearn((s) => !s)} style={{ ...ghostBtn, color: MUTE, fontWeight: 500, fontSize: 12.5, padding: '7px 12px' }}>{showLearn ? 'Hide how learning works' : 'How learning works'}</button>
            {showLearn && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', background: 'var(--surface)', fontSize: 12.5, lineHeight: 1.55 }}>
                <p style={{ margin: '0 0 8px' }}>It doesn't retrain Claude. Each result you log is folded into one compact <strong>playbook</strong>, rewritten tighter — so memory stays small. Only this playbook rides along on the next prompt:</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--f-mono)', fontSize: 11, background: SCREEN, color: SCREEN_TX, padding: '10px 12px', borderRadius: 9, margin: 0, maxHeight: 220, overflow: 'auto' }}>{playbook || 'No playbook yet. Score a few reels and the lessons distil here.'}</pre>
              </div>
            )}

            {error && <div style={{ color: BAD, fontSize: 13, background: 'var(--bad-soft)', border: `1px solid ${BAD}`, borderRadius: 9, padding: '9px 12px' }}>{error}</div>}
          </div>

          {/* RIGHT — live result + scoring */}
          <div style={{ display: 'grid', gap: 14 }}>
            {ideasOpen && <IdeasPanel lab={lab} />}
            {(lineupOpen || lineup?.running) && <LineupPanel lab={lab} config={config} history={history} capLeft={capLeft} dailyCap={dailyCap} />}
            {loading ? (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: '54px 28px', textAlign: 'center', background: PAPER, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid ${LINE}`, borderTopColor: ACCENT, animation: 'll-spin 0.8s linear infinite' }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: ACCENT, marginBottom: 5 }}>Writing your new prompt…</div>
                  <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.6 }}>This replaces whatever was open — live steps stream in the activity log below.</div>
                </div>
              </div>
            ) : !candidates.length && !current ? (
              <div style={{ border: `1px dashed ${LINE}`, borderRadius: 14, padding: '40px 28px', textAlign: 'center', color: MUTE, fontSize: 13.5, lineHeight: 1.65 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Your prompt appears here</div>Set the levers and hit Generate. Each result drops into the queue and the Recent rail — copy it, post the reel, then come back and log how it did. Every score teaches the playbook.
              </div>
            ) : null}

            {!loading && candidates.length > 0 && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Pick the best of {candidates.length}</div>
                  <button onClick={() => setCandidates([])} style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12.5 }}>Discard all</button>
                </div>
                {candidates.map((c, i) => (
                  <div key={c.id} style={{ background: SCREEN, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9, gap: 10 }}>
                      <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#8d887b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Option {i + 1} · {c.text.length} chars{c.title ? ` · ${c.title}` : ''}</span>
                      <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <CopyBtn text={c.text} style={{ background: 'transparent', border: '1px solid #46443c', color: SCREEN_TX, borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }} />
                        <button onClick={() => chooseCandidate(c)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Use this one</button>
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, lineHeight: 1.6, color: SCREEN_TX, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                      {splitSections(c.text).map((s, j) => <div key={j} style={{ marginBottom: 8 }}><span style={{ color: ACCENT, fontWeight: 600 }}>{s.label}</span>{s.body}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && !candidates.length && current && (
              <div style={{ background: SCREEN, borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#8d887b' }}>{current.scenario}{current.hook ? ' · hook' : ''}{current.multiShot ? ' · multi-shot' : ''}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: over ? '#ff8a6b' : '#7fc59c' }}>{count} / {charLimit}</span>
                    <CopyBtn text={current.text} style={{ background: 'transparent', border: '1px solid #46443c', color: SCREEN_TX, borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }} />
                    <button onClick={() => setCurrent(null)} style={{ background: 'transparent', border: 'none', color: '#8d887b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }} aria-label="Close">×</button>
                  </span>
                </div>
                {current.nudge && (
                  <div style={{ fontSize: 12, color: '#8d887b', marginBottom: 10 }}><span style={{ color: ACCENT, fontWeight: 600 }}>Direction: </span>{current.nudge}</div>
                )}
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, lineHeight: 1.7, color: SCREEN_TX, whiteSpace: 'pre-wrap' }}>
                  {sections!.map((s, i) => <div key={i} style={{ marginBottom: i < sections!.length - 1 ? 12 : 0 }}><span style={{ color: ACCENT, fontWeight: 600 }}>{s.label}</span>{s.body}</div>)}
                </div>
              </div>
            )}

            {!loading && !candidates.length && current && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', background: PAPER }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                  <div style={lbl}>Title</div>
                  <button onClick={regenerateTitle} style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12.5 }}>New title</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ flex: 1, fontSize: 15.5, fontWeight: 600, minWidth: 0 }}>{current.title || '—'}</div>
                  <CopyBtn text={current.title || ''} style={{ ...ghostBtn, padding: '7px 12px', fontSize: 12.5, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ flex: 1, fontFamily: 'var(--f-mono)', fontSize: 12.5, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{current.filename || '—'}</code>
                  <CopyBtn text={current.filename || ''} style={{ ...ghostBtn, padding: '7px 12px', fontSize: 12.5, flexShrink: 0 }} />
                </div>
                <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 10, marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: current.caption ? 8 : 0 }}>
                    <div style={{ ...lbl, marginBottom: 0 }}>Caption + hashtags</div>
                    <button onClick={writeCaption} disabled={captioning} style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12.5, opacity: captioning ? 0.6 : 1 }}>{captioning ? 'Writing…' : current.caption ? 'New caption' : 'Write caption'}</button>
                  </div>
                  {current.caption && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', minWidth: 0 }}>{current.caption}</div>
                      <CopyBtn text={current.caption} style={{ ...ghostBtn, padding: '7px 12px', fontSize: 12.5, flexShrink: 0 }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {!loading && !candidates.length && current && <RenderStrip entry={current} job={latestRender.get(current.id)} refsDefault={config.render?.referenceImages !== false} />}

            {!loading && !candidates.length && current && cur && cur.status === 'skipped' ? (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: PAPER }}>
                <span style={{ fontSize: 14, color: MUTE }}>Marked unusable — excluded from learning.</span>
                <button onClick={() => updateEntry({ status: 'queued' })} style={ghostBtn}>Restore to queue</button>
              </div>
            ) : !loading && !candidates.length && current ? (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', background: PAPER }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>How did it do on Facebook?</div>
                  <div style={{ fontSize: 12, color: MUTE }}>{cur && cur.status === 'posted' ? `Posted · ${ago(cur, true)}` : cur && cur.status === 'scored' ? `Scored — edit & re-save to update` : `Created ${ago(cur || current, true)}`}</div>
                </div>

                {/* Step 1 — how far it reached (selection only; nothing commits yet) */}
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 7, fontWeight: 600 }}>1 · How far did it reach?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {REACH.map((r) => { const on = reachDraft === r.id; return <button key={r.id} onClick={() => setReachDraft(r.id)} style={{ flex: '1 1 auto', minWidth: 90, borderRadius: 9, padding: '10px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${r.color}`, background: on ? r.color : 'var(--surface)', color: on ? '#fff' : r.color }}>{r.label}</button> })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: MUTE }}>All-time views (optional):</span>
                  <input value={viewsDraft} onChange={(e) => setViewsDraft(e.target.value)} placeholder="e.g. 1.2m or 300k" style={{ width: 150, padding: '7px 10px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, background: 'var(--surface)', color: INK }} />
                  <span style={{ fontSize: 11.5, color: MUTE }}>hard data for the next analysis round</span>
                </div>

                {/* Step 2 — what to teach it */}
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 7, fontWeight: 600 }}>2 · Tell it why <span style={{ fontWeight: 400 }}>— a comment teaches it most</span></div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={'What happened with this one… e.g. "blended nose got huge comments" or "crowd looked too thin"'} rows={2} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13.5, background: 'var(--surface)', color: INK, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12, fontFamily: 'inherit' }} />
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 7 }}>Illusion check (optional — what broke the realism):</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                  {ILLUSION_TAGS.map((t) => <button key={t} onClick={() => setPickedTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])} style={{ borderRadius: 20, padding: '6px 13px', fontSize: 12.5, cursor: 'pointer', border: `1px solid ${pickedTags.includes(t) ? BAD : LINE}`, background: pickedTags.includes(t) ? 'var(--bad-soft)' : 'var(--surface)', color: pickedTags.includes(t) ? BAD : INK }}>{t}</button>)}
                </div>

                {/* Coverage opt-out — available for any scored clip so it can be ignored */}
                {reachDraft && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', fontSize: 12.5, marginBottom: 14, padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, background: 'var(--surface)' }}>
                    <input type="checkbox" checked={!excludeCoverage} onChange={(e) => setExcludeCoverage(!e.target.checked)} style={{ width: 15, height: 15, accentColor: ACCENT, flexShrink: 0, marginTop: 2 }} />
                    <span><span style={{ fontWeight: 600 }}>Add this clip to coverage.</span> <span style={{ color: MUTE }}>Remembers the aircraft + setting so future “{current.scenario}” prompts can vary. Untick to skip recording this one.</span></span>
                  </label>
                )}

                {/* Step 3 — explicit submit; learning runs once, here */}
                <button
                  onClick={submitScore}
                  disabled={!reachDraft}
                  title={!reachDraft ? 'Pick a reach tier first' : undefined}
                  style={{ ...primaryBtn, cursor: !reachDraft ? 'default' : 'pointer', opacity: !reachDraft ? 0.55 : 1 }}
                >
                  {cur && cur.status === 'scored' ? 'Re-save & update playbook' : config.autoLearn ? 'Save & teach the playbook →' : 'Save result →'}
                </button>
                <div style={{ minHeight: 18, textAlign: 'center', fontSize: 12, marginTop: 7, color: toast ? GOOD : MUTE, fontWeight: toast ? 600 : 400 }}>
                  {toast || (config.autoLearn ? 'Your comment is digested against this exact prompt — wins get reused, mistakes get avoided.' : 'Auto-learn is off — this just records the score.')}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${LINE}`, paddingTop: 12, marginTop: 12 }}>
                  {cur && cur.status === 'scored' && (cur.reach === 'good' || cur.reach === 'viral') && (
                    <button onClick={() => remixWinner(cur)} title="Generate a fresh prompt that keeps this winner's ingredients but changes the aircraft/setting" style={{ ...ghostBtn, color: ACCENT, borderColor: ACCENT, fontWeight: 600 }}>↻ Remix this winner</button>
                  )}
                  {cur && cur.scenarioId?.startsWith('concept:') && !savedConcepts.some((c) => `concept:${c.id}` === cur.scenarioId) && (
                    <button onClick={() => saveThisConcept(cur)} title="Save this AI-invented concept so it can be picked and reused from the Scenario dropdown" style={ghostBtn}>💾 Save this concept</button>
                  )}
                  {cur && cur.status !== 'scored' && <button onClick={() => updateEntry({ status: 'posted', postedAt: (cur && cur.postedAt) || Date.now() })} style={ghostBtn}>Mark as posted</button>}
                  <button onClick={() => updateEntry({ status: 'skipped' })} style={{ ...ghostBtn, color: MUTE }}>Couldn't use this one</button>
                </div>
              </div>
            ) : null}
          </div>

          {/* RIGHT RAIL — recent generations, quick click-to-view */}
          <div className="ll-recent" style={{ position: 'sticky', top: 18 }}>
            <div style={{ ...card, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
                <div style={{ ...lbl, marginBottom: 0 }}>Recent</div>
                <span style={{ fontSize: 11, color: MUTE }}>{Math.min(history.length, 10)}</span>
              </div>
              {history.length === 0 ? (
                <div style={{ fontSize: 12.5, color: MUTE, padding: '4px 2px', lineHeight: 1.5 }}>Your generations show up here — click any to view it again.</div>
              ) : (
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                  {history.slice(0, 10).map((h) => {
                    const m = statusMeta(h)
                    const open = !loading && cur && cur.id === h.id
                    return (
                      <button key={h.id} onClick={() => openEntry(h)} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${open ? ACCENT : LINE}`, background: open ? 'var(--accent-soft)' : 'var(--surface)', borderRadius: 9, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} title={m.label} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || snippet(h.text)}</span>
                          <span style={{ fontSize: 11, color: MUTE, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.scenario}{h.hook ? ' · hook' : ''} · {ago(h)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
