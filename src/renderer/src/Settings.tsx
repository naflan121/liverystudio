import { useState, useEffect, useMemo, useRef } from 'react'
import { INK, PAPER, LINE, MUTE, ACCENT, GOOD, BAD, SCREEN, SCREEN_TX, lbl, sel, ghostBtn } from './ui'
import { AIRCRAFT, CAMERA, CROWD, ENV, groupScenarios } from '@shared/domain'
import { trendMasterPrompt } from '@shared/prompts'
import { winRateStats, comboWinRates, operatorFrequency, DEFAULT_WIN_RATE_DIMS } from '@shared/brain'
import type { AppConfig, CliTestResult, Entry, LogLine, LogLevel, SavedConcept } from '@shared/types'

const LOG_COLORS: Record<LogLevel, string> = { info: '#9c968a', step: '#f2a55e', ok: '#7fc59c', warn: '#e2b53c', err: '#ff8a6b' }
function logTime(ts: number): string { const d = new Date(ts); const p = (n: number) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` }

const MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (fastest / cheapest)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (balanced — recommended)' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (previous gen)' },
  { id: 'claude-opus-5', label: 'Opus 5 (highest quality)' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8 (previous gen)' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1 (most capable — premium cost)' },
  { id: 'claude-fable-5', label: 'Fable 5 (previous gen, premium)' },
]

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '16px 18px', background: '#fff' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, letterSpacing: 0.3 }}>{title}</div>
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={lbl}>{label}</div>{children}</div>
}

export function Settings({ config, onSave, onClose, playbook, onPlaybook, onResetMemory }: {
  config: AppConfig
  onSave: (c: AppConfig) => void
  onClose: () => void
  playbook: string
  onPlaybook: (p: string) => void
  onResetMemory: () => void
}) {
  const [c, setC] = useState<AppConfig>(config)
  const [pb, setPb] = useState(playbook)
  const [savedAt, setSavedAt] = useState(0)
  const [test, setTest] = useState<CliTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [dataPath, setDataPath] = useState('')
  const [dataMsg, setDataMsg] = useState('')
  const [history, setHistory] = useState<Entry[]>([])
  const [redistilling, setRedistilling] = useState(false)
  const [pbMsg, setPbMsg] = useState('')
  const [savedConcepts, setSavedConcepts] = useState<SavedConcept[]>([])

  useEffect(() => { window.api.getDataDir().then(setDataPath) }, [])
  useEffect(() => { window.api.getHistory().then(setHistory) }, [])
  useEffect(() => { if (typeof window.api?.getSavedConcepts === 'function') window.api.getSavedConcepts().then(setSavedConcepts) }, [])

  async function deleteConcept(id: number) {
    if (!confirm('Delete this saved concept? It stays in your history, but you won\'t be able to pick it from the Scenario dropdown anymore.')) return
    setSavedConcepts(await window.api.deleteConcept(id))
  }

  // Live backend activity — the same stream the lab shows, surfaced here so
  // long Settings operations (web research, re-distill, backfill, test) are visible.
  const [logs, setLogs] = useState<LogLine[]>([])
  const logBoxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (typeof window.api?.onLog !== 'function') return
    return window.api.onLog((line) => setLogs((prev) => [...prev.slice(-199), line]))
  }, [])
  useEffect(() => { if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight }, [logs])

  // Which aircraft + settings have done well (Good/Viral) for each scenario.
  // Read straight from history — there is no separate store; the engine's
  // variety feeds are just the recent slice of this same data.
  const coverage = useMemo(() => {
    const byScenario: Record<string, { aircraft: Record<string, number>; envs: Record<string, number> }> = {}
    for (const h of history) {
      if (h.reach !== 'good' && h.reach !== 'viral') continue
      if (h.excludeCoverage) continue
      const ac = (h.pickedAircraft || '').trim()
      const ev = (h.pickedEnv || '').trim()
      if (!ac && !ev) continue
      const s = h.scenario || h.scenarioId || 'Unknown'
      const slot = (byScenario[s] = byScenario[s] || { aircraft: {}, envs: {} })
      if (ac) slot.aircraft[ac] = (slot.aircraft[ac] || 0) + 1
      if (ev) slot.envs[ev] = (slot.envs[ev] || 0) + 1
    }
    return Object.entries(byScenario)
      .map(([scenario, d]) => ({ scenario, aircraft: Object.entries(d.aircraft).sort((a, b) => b[1] - a[1]), envs: Object.entries(d.envs).sort((a, b) => b[1] - a[1]) }))
      .sort((a, b) => a.scenario.localeCompare(b.scenario))
  }, [history])

  // Win rates per lever value, from scored history. A "win" is Good or Viral.
  // Only values with 2+ scored clips are shown — one data point isn't a signal.
  // Computation lives in shared/brain.ts so the same numbers that get fed into
  // the learn/redistill prompts are what's shown here.
  const winRates = useMemo(() => winRateStats(history, DEFAULT_WIN_RATE_DIMS), [history])

  // Scenario x camera combos — surfaces combo-level winners the single-lever
  // view above can hide (e.g. a camera that only shines on one scenario).
  const bestCombos = useMemo(() => comboWinRates(history, (h) => h.scenario, (h) => h.camera || 'auto').slice(0, 8), [history])

  // Global (all-scenario) pick frequency — the same numbers that drive the
  // "avoid overused operators" steering in generation, made visible here.
  const overused = useMemo(() => operatorFrequency(history, { sampleSize: 30 }).filter((r) => r.count >= 4 && r.pct >= 25), [history])

  // Previous playbook versions (snapshotted on every overwrite) for rollback.
  const [pbVersions, setPbVersions] = useState<{ ts: string; text: string }[]>([])
  useEffect(() => {
    if (typeof window.api?.getPlaybookVersions === 'function') window.api.getPlaybookVersions().then(setPbVersions).catch(() => {})
  }, [])

  const [trends, setTrendsState] = useState<{ text: string; updatedAt: string }>({ text: '', updatedAt: '' })
  const [refreshingTrends, setRefreshingTrends] = useState(false)
  const [trendStatus, setTrendStatus] = useState('')
  const [trendPaste, setTrendPaste] = useState('')
  useEffect(() => { window.api.getTrends().then(setTrendsState) }, [])

  async function refreshTrends() {
    setRefreshingTrends(true); setTrendStatus('')
    try {
      const r = await window.api.refreshTrends()
      setTrendsState(r); setTrendStatus(`Updated · ${r.text.length} chars`)
    } catch { setTrendStatus('Web research failed — use the copy-paste fallback below.') } finally { setRefreshingTrends(false) }
  }
  async function saveTrendPaste() {
    if (!trendPaste.trim()) return
    const r = await window.api.setTrends(trendPaste.trim())
    setTrendsState(r); setTrendPaste(''); setTrendStatus(`Saved · ${r.text.length} chars`)
  }

  const [backfilling, setBackfilling] = useState(false)
  const [covMsg, setCovMsg] = useState('')
  async function backfill() {
    setBackfilling(true); setCovMsg('')
    try {
      const r = await window.api.backfillCoverage()
      setHistory(r.history)
      setCovMsg(r.filled ? `Backfilled ${r.filled} result(s).` : 'Coverage already up to date.')
    } catch { setCovMsg('Backfill failed — check the activity log.') } finally { setBackfilling(false) }
  }

  async function browseData() {
    const dir = await window.api.browseDataDir()
    if (!dir) return
    const r = await window.api.setDataDir(dir)
    setDataMsg(r.message)
    if (r.ok) { setDataPath(r.dir); const fresh = await window.api.getConfig(); onSave(fresh); setPb(await window.api.getPlaybook()) }
  }

  async function resetData() {
    const r = await window.api.setDataDir('')
    setDataPath(r.dir); setDataMsg(r.message)
    const fresh = await window.api.getConfig(); onSave(fresh); setPb(await window.api.getPlaybook())
  }

  const set = (patch: Partial<AppConfig>) => setC((prev) => ({ ...prev, ...patch }))
  const setDef = (patch: Partial<AppConfig['defaults']>) => setC((prev) => ({ ...prev, defaults: { ...prev.defaults, ...patch } }))
  const setRender = (patch: Partial<AppConfig['render']>) => setC((prev) => ({ ...prev, render: { ...prev.render, ...patch } }))
  const [excludeDraft, setExcludeDraft] = useState((config.render?.excludeInstances || []).join(', '))
  const [labDir, setLabDir] = useState('')
  const [importMsg, setImportMsg] = useState('')
  useEffect(() => { window.api.getLabDataDir().then(setLabDir).catch(() => { /* ignore */ }) }, [])

  async function browseOutput() {
    const dir = await window.api.renderBrowseOutput()
    if (dir) setRender({ outputDir: dir })
  }

  async function reimportFromLab() {
    if (!confirm('Replace this studio\'s playbook, history and concepts with a fresh copy from Livery Lab? The current studio files are kept as .bak copies. Render jobs are not affected.')) return
    const r = await window.api.importFromLab()
    setImportMsg(r.imported.length ? `Imported ${r.imported.length} file(s). Restart the app to reload everything.` : 'Nothing found to import.')
    setPb(await window.api.getPlaybook()); onPlaybook(await window.api.getPlaybook())
  }

  async function save() {
    const next = await window.api.setConfig(c)
    onSave(next)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(0), 1800)
  }

  async function runTest() {
    setTesting(true); setTest(null)
    await window.api.setConfig({ cliPath: c.cliPath }) // ensure test uses the typed path
    try { setTest(await window.api.testCli()) } finally { setTesting(false) }
  }

  async function savePlaybook() {
    await window.api.setPlaybook(pb)
    onPlaybook(pb)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(0), 1800)
  }

  async function redistill() {
    if (!confirm('Rebuild the entire playbook from scratch using all your scored results? This replaces the current playbook.')) return
    setRedistilling(true); setPbMsg('')
    try {
      const r = await window.api.redistill()
      setPb(r.playbook); onPlaybook(r.playbook)
      setPbMsg(r.used ? `Rebuilt from ${r.used} scored result(s).` : 'No scored results yet to re-distill from.')
    } catch {
      setPbMsg('Re-distill failed — check the activity log.')
    } finally { setRedistilling(false) }
  }

  async function resetMemory() {
    if (!confirm('Erase all history, the learned playbook, and the learning log? This cannot be undone.')) return
    onResetMemory()
    setPb('')
  }

  const num = (v: number, on: (n: number) => void) => (
    <input type="number" value={v} onChange={(e) => on(+e.target.value)} style={{ ...sel, boxSizing: 'border-box' }} />
  )

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT, fontWeight: 600 }}>Settings</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Configuration</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {savedAt > 0 && <span style={{ color: GOOD, fontSize: 13, fontWeight: 600 }}>Saved</span>}
            <button onClick={save} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save settings</button>
            <button onClick={onClose} style={ghostBtn}>Back to lab</button>
          </div>
        </div>

        {(refreshingTrends || redistilling || backfilling || testing || logs.length > 0) && (
          <div style={{ background: SCREEN, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #34322b' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: (refreshingTrends || redistilling || backfilling || testing) ? '#f2a55e' : logs.length ? '#7fc59c' : '#55524a' }} />
              <span style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#8d887b', fontWeight: 600 }}>Activity</span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#55524a' }}>{logs.length}</span>
              {(refreshingTrends || redistilling || backfilling || testing) && <span style={{ fontSize: 11, color: '#f2a55e' }}>working…</span>}
              {logs.length > 0 && <button onClick={() => setLogs([])} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #46443c', color: SCREEN_TX, borderRadius: 7, padding: '2px 9px', fontSize: 11, cursor: 'pointer' }}>Clear</button>}
            </div>
            <div ref={logBoxRef} style={{ maxHeight: 160, overflowY: 'auto', padding: '8px 14px', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11.5, lineHeight: 1.65 }}>
              {logs.length === 0
                ? <div style={{ color: '#55524a' }}>Backend activity streams here in real time…</div>
                : logs.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <span style={{ color: '#55524a', flexShrink: 0 }}>{logTime(l.ts)}</span>
                    <span style={{ color: LOG_COLORS[l.level], flex: 1 }}>{l.msg}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="AI / Claude Code CLI">
            <Field label="Claude CLI path (leave blank to auto-detect)">
              <input value={c.cliPath} onChange={(e) => set({ cliPath: e.target.value })} placeholder="auto-detect" style={{ ...sel, boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
            </Field>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={runTest} disabled={testing} style={{ ...ghostBtn, opacity: testing ? 0.6 : 1 }}>{testing ? 'Testing…' : 'Test connection'}</button>
              {test && <span style={{ fontSize: 13, color: test.ok ? GOOD : BAD }}>{test.message}{test.path ? ` (${test.path})` : ''}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
              <Field label="Generation model">
                <select value={c.generationModel} onChange={(e) => set({ generationModel: e.target.value })} style={sel}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              </Field>
              <Field label="Learning model">
                <select value={c.learningModel} onChange={(e) => set({ learningModel: e.target.value })} style={sel}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              </Field>
              <Field label="Request timeout (ms)">{num(c.timeoutMs, (n) => set({ timeoutMs: n }))}</Field>
            </div>
          </Card>

          <Card title="Prompt length">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14 }}>
              <Field label="Hard char limit">{num(c.charLimit, (n) => set({ charLimit: n }))}</Field>
              <Field label="Target min">{num(c.targetMin, (n) => set({ targetMin: n }))}</Field>
              <Field label="Target max">{num(c.targetMax, (n) => set({ targetMax: n }))}</Field>
            </div>
            <Field label="Always-add Negative terms (extra, comma-separated)">
              <textarea value={c.extraNegatives} onChange={(e) => set({ extraNegatives: e.target.value })} rows={2} placeholder="e.g. lens flare, double exposure" style={{ width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', color: INK }} />
            </Field>
          </Card>

          <Card title="Titles">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
              <input type="checkbox" checked={c.titleEnabled} onChange={(e) => set({ titleEnabled: e.target.checked })} style={{ width: 16, height: 16, accentColor: ACCENT }} />
              <span style={{ fontWeight: 600 }}>Generate an SEO title with each prompt</span>
            </label>
            <Field label="Title max length">{num(c.titleMaxLen, (n) => set({ titleMaxLen: n }))}</Field>
          </Card>

          <Card title="Self-learning memory">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
              <input type="checkbox" checked={c.autoLearn} onChange={(e) => set({ autoLearn: e.target.checked })} style={{ width: 16, height: 16, accentColor: ACCENT }} />
              <span><span style={{ fontWeight: 600 }}>Auto-learn on every result.</span> <span style={{ color: MUTE }}>Folds each scored reel into the playbook automatically.</span></span>
            </label>
            <Field label="Playbook size budget (characters)">{num(c.playbookBudget, (n) => set({ playbookBudget: n }))}</Field>
            <Field label="Current playbook (editable — this is what gets sent to the model)">
              <textarea value={pb} onChange={(e) => setPb(e.target.value)} rows={10} placeholder="Empty — fills in as you score reels." style={{ width: '100%', padding: '12px 14px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'ui-monospace, monospace', background: SCREEN, color: SCREEN_TX }} />
            </Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={savePlaybook} style={ghostBtn}>Save playbook</button>
              <button onClick={redistill} disabled={redistilling} style={{ ...ghostBtn, opacity: redistilling ? 0.6 : 1 }}>{redistilling ? 'Re-distilling…' : 'Re-distill from all history'}</button>
              <button onClick={() => window.api.openDataFolder()} style={ghostBtn}>Open data folder</button>
              <button onClick={resetMemory} style={{ ...ghostBtn, color: BAD, borderColor: BAD, marginLeft: 'auto' }}>Reset all memory</button>
            </div>
            {pbVersions.length > 0 && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value="" onChange={(e) => { const i = Number(e.target.value); if (!Number.isNaN(i) && pbVersions[i]) { setPb(pbVersions[i].text); setPbMsg('Previous version loaded into the editor — click “Save playbook” to restore it.') } }} style={{ ...sel, maxWidth: 360 }}>
                  <option value="" disabled>Roll back — load a previous version…</option>
                  {pbVersions.map((v, i) => <option key={v.ts + i} value={i}>{new Date(v.ts).toLocaleString()} · {v.text.length} chars</option>)}
                </select>
                <span style={{ fontSize: 12, color: MUTE }}>Every playbook rewrite keeps the last {pbVersions.length >= 10 ? 10 : 'few'} versions.</span>
              </div>
            )}
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.55 }}>
              <strong>Re-distill</strong> rebuilds the whole playbook from scratch across all your scored results (uses the Learning model). Good for clearing accumulated bias.{pbMsg ? <span style={{ color: GOOD, fontWeight: 600 }}> {pbMsg}</span> : null}
            </div>
          </Card>

          <Card title="What's working · win rates">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Share of your scored clips that hit <strong>Good</strong> or <strong>Viral</strong>, per lever value (values with at least 2 scored clips). This is the raw data the playbook learns from — use it to spot which levers to lean on.
            </div>
            {winRates.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTE }}>Not enough scored clips yet — score a few results and win rates appear here.</div>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {winRates.map((d) => (
                  <div key={d.title}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{d.title}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {d.rows.map((r) => (
                        <span key={r.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#faf9f6' }}>
                          {r.label}
                          <strong style={{ color: r.pct >= 50 ? GOOD : r.pct >= 25 ? INK : BAD }}>{r.wins}/{r.total}</strong>
                          <span style={{ color: MUTE }}>{r.pct}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {bestCombos.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Best combos · scenario &times; camera</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {bestCombos.map((c) => (
                    <span key={c.a + '|' + c.b} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#faf9f6' }}>
                      {c.a} &middot; {c.b}
                      <strong style={{ color: c.pct >= 50 ? GOOD : c.pct >= 25 ? INK : BAD }}>{c.wins}/{c.total}</strong>
                      <span style={{ color: MUTE }}>{c.pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {overused.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: BAD }}>Overused &middot; currently avoided in generation</div>
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 6 }}>Aircraft/operators eating a disproportionate share of the last 30 picks page-wide — new generations actively steer away from these regardless of scenario.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {overused.map((o) => (
                    <span key={o.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${BAD}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#fff' }}>
                      {o.label}
                      <strong style={{ color: BAD }}>{o.count}/{o.total}</strong>
                      <span style={{ color: MUTE }}>{o.pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title="Coverage · aircraft & settings">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Aircraft and settings that scored <strong>Good</strong> or <strong>Viral</strong> for each scenario (only those are recorded — and only if you left the “Add to coverage” box ticked). The engine always steers to a fresh <strong>aircraft</strong>; tick <strong>“Vary using coverage”</strong> in the lab to also push to a fresh <strong>setting</strong>. The same one can still appear under a different scenario. Stored on the history entry; resets with “Reset all memory”.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={backfill} disabled={backfilling} style={{ ...ghostBtn, opacity: backfilling ? 0.6 : 1 }}>{backfilling ? 'Backfilling…' : 'Backfill coverage from history'}</button>
              {covMsg ? <span style={{ fontSize: 12.5, color: GOOD, fontWeight: 600 }}>{covMsg}</span> : <span style={{ fontSize: 12, color: MUTE }}>Fills in aircraft + setting for Good/Viral clips scored before this existed.</span>}
            </div>
            {coverage.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTE }}>Nothing recorded yet — score some clips Good/Viral (or run Backfill) and the aircraft + settings used will appear here, grouped by scenario.</div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {coverage.map(({ scenario, aircraft, envs }) => (
                  <div key={scenario}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{scenario}</div>
                    {aircraft.length > 0 && (
                      <div style={{ marginBottom: envs.length ? 8 : 0 }}>
                        <div style={{ fontSize: 11, color: MUTE, marginBottom: 5 }}>Aircraft · {aircraft.length}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {aircraft.map(([name, n]) => (
                            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#faf9f6' }}>
                              {name}{n > 1 && <strong style={{ color: ACCENT }}>×{n}</strong>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {envs.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: MUTE, marginBottom: 5 }}>Settings · {envs.length}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                          {envs.map(([name, n]) => (
                            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#fff' }}>
                              {name}{n > 1 && <strong style={{ color: ACCENT }}>×{n}</strong>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="AI Concepts · saved library">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Concepts you've saved from "💡 Surprise concept" in the lab — pick one from the Scenario dropdown to reuse it. Deleting one here only removes it from that dropdown; past clips generated from it stay in your history.
            </div>
            {savedConcepts.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTE }}>None saved yet — generate one with "💡 Surprise concept" in the lab, then "💾 Save this concept" if you like it.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {savedConcepts.map((c) => (
                  <div key={c.id} style={{ border: `1px solid ${LINE}`, borderRadius: 9, padding: '9px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</div>
                      <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{c.brief}</div>
                      <div style={{ fontSize: 11, color: MUTE, marginTop: 4 }}>Saved {new Date(c.createdAt).toLocaleString()}</div>
                    </div>
                    <button onClick={() => deleteConcept(c.id)} style={{ ...ghostBtn, color: BAD, borderColor: BAD, flexShrink: 0 }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Trends · ride what's hot">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Pull a fresh digest of what's currently trending in aviation / RC short-form, then tick <strong>“Use current trends”</strong> in the lab to weave it into prompts. <strong>Refresh</strong> uses the Claude CLI's web search. If that's unavailable, use the copy-paste fallback below.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={refreshTrends} disabled={refreshingTrends} style={{ ...ghostBtn, opacity: refreshingTrends ? 0.6 : 1 }}>{refreshingTrends ? 'Researching the web…' : 'Refresh trends (web)'}</button>
              <span style={{ fontSize: 12.5, color: MUTE }}>{trends.updatedAt ? `Last updated ${new Date(trends.updatedAt).toLocaleString()}` : 'No digest yet'}</span>
              {trendStatus ? <span style={{ fontSize: 12.5, color: GOOD, fontWeight: 600 }}>{trendStatus}</span> : null}
            </div>
            {trends.text ? (
              <Field label="Current trends digest (what gets sent when the checkbox is on)">
                <textarea value={trends.text} readOnly rows={8} style={{ width: '100%', padding: '12px 14px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'ui-monospace, monospace', background: SCREEN, color: SCREEN_TX }} />
              </Field>
            ) : null}
            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: MUTE, fontWeight: 600 }}>Fallback — paste from any web-capable AI</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => navigator.clipboard?.writeText(trendMasterPrompt())} style={ghostBtn}>Copy research prompt</button>
                <span style={{ fontSize: 12, color: MUTE }}>Run it in any agent with web access, then paste the digest here:</span>
              </div>
              <textarea value={trendPaste} onChange={(e) => setTrendPaste(e.target.value)} rows={4} placeholder="Paste the trend digest here…" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 12.5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', color: INK }} />
              <div><button onClick={saveTrendPaste} disabled={!trendPaste.trim()} style={{ ...ghostBtn, opacity: trendPaste.trim() ? 1 : 0.6 }}>Save pasted digest</button></div>
            </div>
          </Card>

          <Card title="Render · Dola / Seedance">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Prompts are rendered through <strong>DolaMultiBrowser</strong> (Control API must be enabled). Each Dola instance renders one video at a time; the watermark-free MP4 lands in the folder below with a .json sidecar. Don't drive the same instances from the dola MCP at the same time.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14 }}>
              <Field label="Daily cap (renders sent / day)">{num(c.render.dailyCap, (n) => setRender({ dailyCap: Math.max(0, n) }))}</Field>
              <Field label="Max at once (0 = one per free instance)">{num(c.render.maxParallel, (n) => setRender({ maxParallel: Math.max(0, n) }))}</Field>
              <Field label="Wait per video (minutes)">{num(c.render.waitMinutes, (n) => setRender({ waitMinutes: Math.max(5, n) }))}</Field>
            </div>
            <Field label="Reserved instance ids (never used for rendering, comma-separated)">
              <input value={excludeDraft} onChange={(e) => { setExcludeDraft(e.target.value); setRender({ excludeInstances: e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isInteger(n)) }) }} placeholder="e.g. 5, 16" style={{ ...sel, boxSizing: 'border-box' }} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14 }}>
              <Field label="Model line"><input value={c.render.model} onChange={(e) => setRender({ model: e.target.value })} style={{ ...sel, boxSizing: 'border-box' }} /></Field>
              <Field label="Duration line"><input value={c.render.duration} onChange={(e) => setRender({ duration: e.target.value })} style={{ ...sel, boxSizing: 'border-box' }} /></Field>
              <Field label="Aspect line"><input value={c.render.aspect} onChange={(e) => setRender({ aspect: e.target.value })} style={{ ...sel, boxSizing: 'border-box' }} /></Field>
            </div>
            <Field label="Video folder">
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={c.render.outputDir} onChange={(e) => setRender({ outputDir: e.target.value })} style={{ ...sel, boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
                <button onClick={browseOutput} style={{ ...ghostBtn, flexShrink: 0 }}>Choose…</button>
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input type="checkbox" checked={c.render.autoRender} onChange={(e) => setRender({ autoRender: e.target.checked })} style={{ width: 16, height: 16, accentColor: ACCENT }} /> Auto-render every new prompt
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input type="checkbox" checked={c.render.autoStartInstances} onChange={(e) => setRender({ autoStartInstances: e.target.checked })} style={{ width: 16, height: 16, accentColor: ACCENT }} /> Start stopped instances when none is free
              </label>
            </div>
          </Card>

          <Card title="Brain source · Livery Lab">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Livery Studio started with a <strong>copy</strong> of Livery Lab's brain. The two now learn separately — the Lab's files are never written from here. Re-import only if you kept working in the Lab and want its latest playbook and history here.
            </div>
            <Field label="Livery Lab data folder">
              <code style={{ display: 'block', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 12, fontFamily: 'ui-monospace, monospace', color: INK, wordBreak: 'break-all', background: '#faf9f6' }}>{labDir || '—'}</code>
            </Field>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={reimportFromLab} style={ghostBtn}>Re-import from Livery Lab…</button>
              {importMsg && <span style={{ fontSize: 12.5, color: GOOD }}>{importMsg}</span>}
            </div>
          </Card>

          <Card title="Data folder · multi-device sync">
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6 }}>
              Point this at a <strong>Google Drive folder</strong> to make your history and learned playbook follow you to every PC. <strong>Use a different folder from Livery Lab's</strong> — the two apps must not share data files. On each device, install this app and set the same Drive folder here. <strong>Don’t run the app on two PCs at the same time</strong> — that can cause sync conflicts on the data files.
            </div>
            <Field label="Current data folder">
              <code style={{ display: 'block', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 12, fontFamily: 'ui-monospace, monospace', color: INK, wordBreak: 'break-all', background: '#faf9f6' }}>{dataPath || '—'}</code>
            </Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={browseData} style={ghostBtn}>Choose folder…</button>
              <button onClick={() => window.api.openDataFolder()} style={ghostBtn}>Open folder</button>
              <button onClick={resetData} style={{ ...ghostBtn, color: MUTE }}>Use this device’s default</button>
              {dataMsg && <span style={{ fontSize: 12.5, color: GOOD }}>{dataMsg}</span>}
            </div>
          </Card>

          <Card title="Default levers for new prompts">
            <Field label="Scenario">
              <select value={c.defaults.scenario} onChange={(e) => setDef({ scenario: e.target.value })} style={sel}>
                {groupScenarios().map(([group, items]) => group === ''
                  ? items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)
                  : <optgroup key={group} label={group}>{items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 14 }}>
              <Field label="Aircraft"><select value={c.defaults.aircraft} onChange={(e) => setDef({ aircraft: e.target.value })} style={sel}>{AIRCRAFT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
              <Field label="Crowd"><select value={c.defaults.crowd} onChange={(e) => setDef({ crowd: e.target.value })} style={sel}>{CROWD.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
              <Field label="Environment"><select value={c.defaults.env} onChange={(e) => setDef({ env: e.target.value })} style={sel}>{ENV.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
              <Field label="Camera identity"><select value={c.defaults.camera || 'auto'} onChange={(e) => setDef({ camera: e.target.value })} style={sel}>{CAMERA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
            </div>
            <Field label={`Exploration · ${c.defaults.explore}`}>
              <input type="range" min={0} max={100} value={c.defaults.explore} onChange={(e) => setDef({ explore: +e.target.value })} style={{ width: '100%', accentColor: ACCENT }} />
            </Field>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input type="checkbox" checked={c.defaults.hook} onChange={(e) => setDef({ hook: e.target.checked })} style={{ width: 16, height: 16, accentColor: ACCENT }} /> Hook mode on by default
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input type="checkbox" checked={c.defaults.multiShot} onChange={(e) => setDef({ multiShot: e.target.checked })} style={{ width: 16, height: 16, accentColor: ACCENT }} /> Multi-shot on by default
              </label>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
