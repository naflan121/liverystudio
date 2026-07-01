import { useState, useEffect, useCallback, useRef } from 'react'
import {
  INK, PAPER, LINE, MUTE, ACCENT, GOOD, BAD, VIRAL, WAIT, SCREEN, SCREEN_TX, lbl, sel, ghostBtn, primaryBtn, card,
} from './ui'
import { REACH, ILLUSION_TAGS, AIRCRAFT, CROWD, ENV, SCENARIOS, groupScenarios } from '@shared/domain'
import { snippet, toFilename } from '@shared/util'
import type { AppConfig, Entry, ReachId, LogLine, LogLevel } from '@shared/types'
import { Settings } from './Settings'

const LOG_COLORS: Record<LogLevel, string> = {
  info: '#9c968a', step: '#f2a55e', ok: '#7fc59c', warn: '#e2b53c', err: '#ff8a6b',
}
function logTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function LogPanel({ logs, onClear }: { logs: LogLine[]; onClear: () => void }) {
  const [open, setOpen] = useState(true)
  const [follow, setFollow] = useState(true)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open && follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [logs, open, follow])

  return (
    <div style={{ background: SCREEN, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: open ? '1px solid #34322b' : 'none' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: logs.length ? '#7fc59c' : '#55524a', flexShrink: 0 }} />
        <span style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#8d887b', fontWeight: 600 }}>Activity log</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#55524a' }}>{logs.length}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setFollow((f) => !f)} title="Auto-scroll to newest" style={{ background: 'transparent', border: '1px solid #46443c', color: follow ? '#7fc59c' : '#8d887b', borderRadius: 7, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}>{follow ? 'Follow ✓' : 'Follow'}</button>
          <button onClick={onClear} style={{ background: 'transparent', border: '1px solid #46443c', color: SCREEN_TX, borderRadius: 7, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}>Clear</button>
          <button onClick={() => setOpen((o) => !o)} style={{ background: 'transparent', border: '1px solid #46443c', color: SCREEN_TX, borderRadius: 7, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}>{open ? 'Hide' : 'Show'}</button>
        </span>
      </div>
      {open && (
        <div ref={boxRef} style={{ maxHeight: 220, overflowY: 'auto', padding: '10px 14px', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11.5, lineHeight: 1.7 }}>
          {logs.length === 0
            ? <div style={{ color: '#55524a' }}>Waiting for activity… generate a prompt or log a result to see the backend work here.</div>
            : logs.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <span style={{ color: '#55524a', flexShrink: 0 }}>{logTime(l.ts)}</span>
                <span style={{ color: LOG_COLORS[l.level], flex: 1 }}>{l.msg}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function copyText(s: string) {
  s = s || ''
  const fallback = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = s; ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    } catch { /* ignore */ }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).catch(fallback)
    else fallback()
  } catch { fallback() }
}

function CopyBtn({ text, style, label }: { text: string; style?: React.CSSProperties; label?: string }) {
  const [done, setDone] = useState(false)
  return <button onClick={() => { copyText(text); setDone(true); setTimeout(() => setDone(false), 1300) }} style={style}>{done ? 'Copied' : (label || 'Copy')}</button>
}

function statusMeta(h: Entry) {
  if (h.status === 'scored') { const r = REACH.find((x) => x.id === h.reach); return { label: r ? r.label : 'Scored', color: r ? r.color : '#1F7A4D' } }
  if (h.status === 'posted') return { label: 'Posted', color: ACCENT }
  if (h.status === 'skipped') return { label: 'Skipped', color: MUTE }
  return { label: 'Awaiting', color: WAIT }
}
function daysSince(h: Entry) { const base = h.postedAt || new Date(h.ts).getTime(); return Math.floor((Date.now() - base) / 86400000) }
function ago(h: Entry, posted?: boolean) {
  const base = posted && h.postedAt ? h.postedAt : new Date(h.ts).getTime()
  const d = Math.floor((Date.now() - base) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 7) return d + ' days ago'
  const w = Math.floor(d / 7)
  return w + (w === 1 ? ' week ago' : ' weeks ago')
}
function splitForView(text: string) {
  const out: { label: string; body: string }[] = []
  const arr = ['Visual:', 'Audio:', 'Negative:']
  arr.forEach((label, i) => {
    const start = text.indexOf(label)
    if (start === -1) return
    let end = text.length
    for (let j = i + 1; j < arr.length; j++) { const n = text.indexOf(arr[j]); if (n > -1) { end = n; break } }
    const body = text.slice(start + label.length, end).trim()
    out.push({ label, body: body ? ' ' + body : '' })
  })
  return out.length ? out : [{ label: '', body: text }]
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [view, setView] = useState<'lab' | 'settings'>('lab')
  const [history, setHistory] = useState<Entry[]>([])
  const [playbook, setPlaybook] = useState('')

  const [scenario, setScenario] = useState('random')
  const [aircraft, setAircraft] = useState('placeholder')
  const [crowd, setCrowd] = useState('busy')
  const [env, setEnv] = useState('auto')
  const [hook, setHook] = useState(false)
  const [multiShot, setMultiShot] = useState(false)
  const [punchyOpen, setPunchyOpen] = useState(false)
  const [tier1Only, setTier1Only] = useState(false)
  const [varyCoverage, setVaryCoverage] = useState(false)
  const [useTrends, setUseTrends] = useState(false)
  const [candidateMode, setCandidateMode] = useState(false)
  const [candidates, setCandidates] = useState<Entry[]>([])
  const [nudge, setNudge] = useState('')
  const [explore, setExplore] = useState(45)

  const [loading, setLoading] = useState(false)
  // How many learn tasks are running in the background (a counter, not a flag,
  // so overlapping submits don't switch the indicator off too early).
  const [learnCount, setLearnCount] = useState(0)
  const learning = learnCount > 0
  const [error, setError] = useState('')
  const [current, setCurrent] = useState<Entry | null>(null)
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [reachDraft, setReachDraft] = useState<ReachId | null>(null)
  const [excludeCoverage, setExcludeCoverage] = useState(false)
  const [toast, setToast] = useState('')
  const [showLearn, setShowLearn] = useState(false)
  const [filter, setFilter] = useState('toscore')
  const [logs, setLogs] = useState<LogLine[]>([])

  // A small, self-clearing confirmation line (quiet — no modal).
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }, [])

  useEffect(() => {
    (async () => {
      const cfg = await window.api.getConfig()
      setConfig(cfg)
      setScenario(cfg.defaults.scenario); setAircraft(cfg.defaults.aircraft); setCrowd(cfg.defaults.crowd)
      setEnv(cfg.defaults.env); setExplore(cfg.defaults.explore); setHook(cfg.defaults.hook); setMultiShot(cfg.defaults.multiShot)
      setHistory(await window.api.getHistory())
      setPlaybook(await window.api.getPlaybook())
    })()
  }, [])

  // Stream backend activity into the terminal-style log (cap at 500 lines).
  // Guarded: if the preload is stale and lacks onLog, skip rather than crash.
  useEffect(() => {
    if (typeof window.api?.onLog !== 'function') return
    const off = window.api.onLog((line) => setLogs((prev) => [...prev.slice(-499), line]))
    return off
  }, [])

  const persist = useCallback(async (next: Entry[]) => {
    setHistory(next)
    try { await window.api.setHistory(next) } catch { /* ignore */ }
  }, [])

  const rated = history.filter((h) => h.status === 'scored' && h.reach)
  const tierCount = (id: ReachId) => rated.filter((h) => h.reach === id).length
  const hookTries = rated.filter((h) => h.hook)
  const hookStrong = hookTries.filter((h) => h.reach === 'viral' || h.reach === 'good')

  const counts: Record<string, number> = {
    toscore: history.filter((h) => h.status === 'queued' || h.status === 'posted').length,
    scored: history.filter((h) => h.status === 'scored').length,
    skipped: history.filter((h) => h.status === 'skipped').length,
    all: history.length,
  }

  // Runs the learn step in the background — the caller does NOT await this, so
  // the user can keep scoring, opening entries, or generating while the playbook
  // distils. Backend serialises CLI calls (exclusive chain), so overlapping
  // learns queue safely and each sees the previous result.
  async function doLearn(entry: Entry) {
    if (!config?.autoLearn) { flashToast('Result saved ✓'); return }
    setLearnCount((n) => n + 1)
    try {
      const { playbook: pb } = await window.api.learn(entry)
      setPlaybook(pb)
      flashToast('Playbook updated ✓')
    } catch {
      flashToast('Saved — learning step failed')
    } finally { setLearnCount((n) => Math.max(0, n - 1)) }
  }

  async function generate() {
    if (loading) return
    setError(''); setLoading(true); setPickedTags([]); setComment(''); setReachDraft(null); setExcludeCoverage(false); setCandidates([])
    const pool = SCENARIOS.filter((s) => s.id !== 'random')
    const resolved = scenario === 'random' ? pool[Math.floor(Math.random() * pool.length)] : SCENARIOS.find((s) => s.id === scenario)!
    const req = { resolved, aircraft, crowd, env, hook, multiShot, punchyOpen, tier1Only, varyCoverage, useTrends, explore, nudge }
    const mk = (res: { text: string; title: string; filename: string }): Entry => ({
      id: Date.now(), text: res.text, title: res.title, filename: res.filename,
      scenario: resolved.label, scenarioId: resolved.id, aircraft, pickedAircraft: '', pickedEnv: '', crowd, env, hook, multiShot, punchyOpen,
      status: 'queued', postedAt: null, reach: null, tags: [], comment: '', ts: new Date().toISOString(),
    })
    try {
      if (candidateMode) {
        const got: Entry[] = []
        for (let i = 0; i < 3; i++) {
          try { got.push({ ...mk(await window.api.generate(req)), id: Date.now() + i }) } catch { /* skip this candidate */ }
        }
        if (!got.length) throw new Error('All candidate generations failed.')
        setCandidates(got)
      } else {
        const entry = mk(await window.api.generate(req))
        setCurrent(entry); persist([entry, ...history])
      }
    } catch (e: any) {
      setError(e?.message || 'Could not reach the model. Check Settings → Test connection.')
    } finally { setLoading(false) }
  }

  function chooseCandidate(entry: Entry) {
    setCandidates([]); setCurrent(entry); persist([entry, ...history])
  }

  // Ctrl/Cmd+Enter generates from anywhere. A ref keeps the handler pointed at
  // the latest closure (current lever state) without re-binding the listener.
  const generateRef = useRef(generate)
  generateRef.current = generate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generateRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openEntry(h: Entry) { setCurrent(h); setPickedTags(h.tags || []); setComment(h.comment || ''); setReachDraft(h.reach || null); setExcludeCoverage(!!h.excludeCoverage) }

  // Save without learning — used for posted / skipped / restore.
  function updateEntry(patch: Partial<Entry>) {
    if (!current) return
    const updated: Entry = { ...current, comment: comment.trim(), tags: pickedTags, ...patch }
    setCurrent(updated)
    persist(history.map((h) => (h.id === current.id ? updated : h)))
  }

  // The explicit submit: commit the full draft (tier + comment + flags) once,
  // then run learning on the complete feedback — never mid-typing.
  async function submitScore() {
    if (!current || !reachDraft) return
    const excl = excludeCoverage
    const updated: Entry = { ...current, comment: comment.trim(), tags: pickedTags, reach: reachDraft, status: 'scored', excludeCoverage: excl }
    setCurrent(updated)
    const next = history.map((h) => (h.id === current.id ? updated : h))
    persist(next)
    // Immediate confirmation, then learning runs in the background (not awaited)
    // so you can keep working straight away.
    if (config.autoLearn) flashToast('Saved ✓ — teaching the playbook in the background')
    doLearn(updated)
    // Record coverage (aircraft + setting) for any clip the user kept (checkbox on).
    // Skip if already captured (pickedEnv present) or opted out via the checkbox.
    if (!excl && !updated.pickedEnv) {
      try {
        const scene = await window.api.identifyScene(updated.text)
        if (scene && (scene.aircraft || scene.environment)) {
          const withScene: Entry = { ...updated, pickedAircraft: updated.pickedAircraft || scene.aircraft || '', pickedEnv: scene.environment || '' }
          setCurrent((c) => (c && c.id === withScene.id ? withScene : c))
          persist(next.map((h) => (h.id === withScene.id ? withScene : h)))
        }
      } catch { /* best-effort — coverage just won't record this one */ }
    }
  }

  function patchCurrent(patch: Partial<Entry>) {
    if (!current) return
    const updated = { ...current, ...patch }
    setCurrent(updated)
    persist(history.map((h) => (h.id === current.id ? updated : h)))
  }

  function titleAvoidList(extra?: string) {
    const arr = history.filter((h) => h.title && h.title.trim()).map((h) => h.title.trim())
    if (extra) arr.push(extra)
    return [...new Set(arr)].slice(0, 8)
  }

  async function regenerateTitle() {
    if (!current) return
    try {
      const t = await window.api.title({ text: current.text, avoid: titleAvoidList(current.title) })
      patchCurrent({ title: t, filename: toFilename(t || current.scenario) })
    } catch { /* ignore */ }
  }

  async function clearAll() {
    try { await window.api.resetMemory() } catch { /* ignore */ }
    setHistory([]); setCurrent(null); setPlaybook('')
  }

  const count = current ? current.text.length : 0
  const charLimit = config?.charLimit ?? 1500
  const over = count > charLimit
  const sections = current ? splitForView(current.text) : null
  const cur = current ? history.find((h) => h.id === current.id) || current : null

  let listView = [...history]
  if (filter === 'toscore') listView = listView.filter((h) => h.status === 'queued' || h.status === 'posted')
  else if (filter === 'scored') listView = listView.filter((h) => h.status === 'scored')
  else if (filter === 'skipped') listView = listView.filter((h) => h.status === 'skipped')

  if (!config) {
    return <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui', color: MUTE }}>Loading…</div>
  }

  if (view === 'settings') {
    return <Settings config={config} onSave={setConfig} onClose={() => setView('lab')} playbook={playbook} onPlaybook={setPlaybook} onResetMemory={clearAll} />
  }

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
  const runHint = isMac ? '⌘↵' : 'Ctrl+↵'

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <style>{`
        @keyframes ll-spin{to{transform:rotate(360deg)}}
        .ll-wrap{max-width:1440px;margin:0 auto;padding:18px}
        .ll-grid{display:grid;grid-template-columns:340px minmax(0,1fr) 252px;gap:16px;align-items:start}
        @media (max-width:1180px){.ll-grid{grid-template-columns:minmax(280px,320px) minmax(0,1fr)}.ll-recent{grid-column:1 / -1 !important;position:static !important}}
        @media (max-width:760px){.ll-grid{grid-template-columns:1fr}.ll-controls{position:static !important}}
      `}</style>
      <div className="ll-wrap">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT, fontWeight: 600 }}>Livery Lab · desktop · self-learning</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>Scale-illusion prompt lab</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {learning && <span style={{ color: ACCENT, fontSize: 12.5, fontWeight: 600 }}>teaching playbook…{learnCount > 1 ? ` (${learnCount})` : ''}</span>}
            <button onClick={() => setView('settings')} style={{ ...ghostBtn, padding: '8px 14px' }}>Settings</button>
          </div>
        </div>

        {/* Scoreboard */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {REACH.slice().reverse().map((r) => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#fff' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
              <strong style={{ color: r.color }}>{tierCount(r.id)}</strong>
              <span style={{ color: MUTE }}>{r.id === 'flop' ? 'flop' : r.id === 'normal' ? 'normal' : r.id === 'good' ? 'good' : 'viral'}</span>
            </span>
          ))}
          {hookTries.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', fontSize: 12.5, background: '#fff', color: MUTE }}>hook <strong style={{ color: INK }}>{hookStrong.length}/{hookTries.length}</strong></span>}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: counts.toscore > 0 ? ACCENT : MUTE, fontWeight: 600 }}>{counts.toscore} awaiting your result</span>
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
              </select>
            </div>

            <div><div style={lbl}>Aircraft</div><select value={aircraft} onChange={(e) => setAircraft(e.target.value)} style={sel}>{AIRCRAFT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
            <div><div style={lbl}>Crowd density</div><select value={crowd} onChange={(e) => setCrowd(e.target.value)} style={sel}>{CROWD.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div><div style={lbl}>Environment</div><select value={env} onChange={(e) => setEnv(e.target.value)} style={sel}>{ENV.map((e2) => <option key={e2.id} value={e2.id}>{e2.label}</option>)}</select></div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: `1px solid ${hook ? ACCENT : LINE}`, borderRadius: 10, padding: '10px 14px', background: hook ? '#FBEADF' : '#fff' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: hook ? ACCENT : INK }}>Hook mode {hook ? 'on' : 'off'}</div>
                <div style={{ fontSize: 12, color: MUTE }}>One photoreal-but-impossible detail — the "what is that?" gamble.</div>
              </div>
              <button onClick={() => setHook((h) => !h)} style={{ border: 'none', cursor: 'pointer', borderRadius: 20, width: 46, height: 26, background: hook ? ACCENT : '#CBC7BD', position: 'relative', flexShrink: 0 }} aria-label="Toggle hook mode"><span style={{ position: 'absolute', top: 3, left: hook ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={multiShot} onChange={(e) => setMultiShot(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Multiple shots / angles.</span> <span style={{ color: MUTE }}>Off = one continuous take.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={punchyOpen} onChange={(e) => setPunchyOpen(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Punchy 3-sec open.</span> <span style={{ color: MUTE }}>Engineer a scroll-stopping first second.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: aircraft === 'placeholder' ? 'not-allowed' : 'pointer', fontSize: 13, opacity: aircraft === 'placeholder' ? 0.5 : 1 }}>
              <input type="checkbox" checked={tier1Only} disabled={aircraft === 'placeholder'} onChange={(e) => setTier1Only(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Tier-1 countries only.</span> <span style={{ color: MUTE }}>Airline/operator from USA, Canada, UK, Australia, NZ only — steers off repeats like ANA.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={varyCoverage} onChange={(e) => setVaryCoverage(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Vary using coverage.</span> <span style={{ color: MUTE }}>Push to a setting not used recently (Environment = auto).</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={useTrends} onChange={(e) => setUseTrends(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Use current trends.</span> <span style={{ color: MUTE }}>Ride what's hot. Refresh the digest in Settings.</span></span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={candidateMode} onChange={(e) => setCandidateMode(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span><span style={{ fontWeight: 600 }}>Generate 3 to choose from.</span> <span style={{ color: MUTE }}>Slower; you pick one, the rest are discarded.</span></span>
            </label>

            <div><div style={lbl}>Exploration · {explore < 34 ? 'proven' : explore > 66 ? 'experimental' : 'balanced'}</div><input type="range" min={0} max={100} value={explore} onChange={(e) => setExplore(+e.target.value)} style={{ width: '100%', accentColor: ACCENT }} /></div>

            <div><div style={lbl}>Direction for this one (optional)</div><input value={nudge} onChange={(e) => setNudge(e.target.value)} placeholder="e.g. Emirates A380, dusk, packed grandstand" style={{ ...sel, boxSizing: 'border-box' }} /></div>

            <div>
              <button onClick={generate} disabled={loading} style={{ ...primaryBtn, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? 'Writing…' : 'Generate prompt'}</button>
              <div style={{ textAlign: 'center', fontSize: 11.5, color: MUTE, marginTop: 6 }}>or press <kbd style={{ fontFamily: 'ui-monospace, monospace', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 5, padding: '1px 6px' }}>{runHint}</kbd></div>
            </div>

            <button onClick={() => setShowLearn((s) => !s)} style={{ ...ghostBtn, color: MUTE, fontWeight: 500, fontSize: 12.5, padding: '7px 12px' }}>{showLearn ? 'Hide how learning works' : 'How learning works'}</button>
            {showLearn && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', background: '#fff', fontSize: 12.5, lineHeight: 1.55 }}>
                <p style={{ margin: '0 0 8px' }}>It doesn't retrain Claude. Each result you log is folded into one compact <strong>playbook</strong>, rewritten tighter — so memory stays small. Only this playbook rides along on the next prompt:</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 11, background: SCREEN, color: SCREEN_TX, padding: '10px 12px', borderRadius: 9, margin: 0, maxHeight: 220, overflow: 'auto' }}>{playbook || 'No playbook yet. Score a few reels and the lessons distil here.'}</pre>
              </div>
            )}

            {error && <div style={{ color: BAD, fontSize: 13, background: '#F6E4E1', border: `1px solid ${BAD}`, borderRadius: 9, padding: '9px 12px' }}>{error}</div>}
          </div>

          {/* RIGHT — live result + scoring */}
          <div style={{ display: 'grid', gap: 14 }}>
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
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12, lineHeight: 1.6, color: SCREEN_TX, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                      {splitForView(c.text).map((s, j) => <div key={j} style={{ marginBottom: 8 }}><span style={{ color: ACCENT, fontWeight: 600 }}>{s.label}</span>{s.body}</div>)}
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
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: over ? '#ff8a6b' : '#7fc59c' }}>{count} / {charLimit}</span>
                    <CopyBtn text={current.text} style={{ background: 'transparent', border: '1px solid #46443c', color: SCREEN_TX, borderRadius: 7, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }} />
                    <button onClick={() => setCurrent(null)} style={{ background: 'transparent', border: 'none', color: '#8d887b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }} aria-label="Close">×</button>
                  </span>
                </div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12.5, lineHeight: 1.7, color: SCREEN_TX, whiteSpace: 'pre-wrap' }}>
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
                  <code style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{current.filename || '—'}</code>
                  <CopyBtn text={current.filename || ''} style={{ ...ghostBtn, padding: '7px 12px', fontSize: 12.5, flexShrink: 0 }} />
                </div>
              </div>
            )}

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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {REACH.map((r) => { const on = reachDraft === r.id; return <button key={r.id} onClick={() => setReachDraft(r.id)} style={{ flex: '1 1 auto', minWidth: 90, borderRadius: 9, padding: '10px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${r.color}`, background: on ? r.color : '#fff', color: on ? '#fff' : r.color }}>{r.label}</button> })}
                </div>

                {/* Step 2 — what to teach it */}
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 7, fontWeight: 600 }}>2 · Tell it why <span style={{ fontWeight: 400 }}>— a comment teaches it most</span></div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={'What happened with this one… e.g. "blended nose got huge comments" or "crowd looked too thin"'} rows={2} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13.5, background: '#fff', color: INK, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12, fontFamily: 'inherit' }} />
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 7 }}>Illusion check (optional — what broke the realism):</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
                  {ILLUSION_TAGS.map((t) => <button key={t} onClick={() => setPickedTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])} style={{ borderRadius: 20, padding: '6px 13px', fontSize: 12.5, cursor: 'pointer', border: `1px solid ${pickedTags.includes(t) ? BAD : LINE}`, background: pickedTags.includes(t) ? '#F6E4E1' : '#fff', color: pickedTags.includes(t) ? BAD : INK }}>{t}</button>)}
                </div>

                {/* Coverage opt-out — available for any scored clip so it can be ignored */}
                {reachDraft && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', fontSize: 12.5, marginBottom: 14, padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff' }}>
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
                <div style={{ display: 'grid', gap: 6 }}>
                  {history.slice(0, 10).map((h) => {
                    const m = statusMeta(h)
                    const open = !loading && cur && cur.id === h.id
                    return (
                      <button key={h.id} onClick={() => openEntry(h)} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${open ? ACCENT : LINE}`, background: open ? '#FBEADF' : '#fff', borderRadius: 9, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
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

        {/* Activity log — full width */}
        <div style={{ marginTop: 16 }}>
          <LogPanel logs={logs} onClear={() => setLogs([])} />
        </div>

        {/* History — full width */}
        {history.length > 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {[['toscore', 'To score'], ['scored', 'Scored'], ['skipped', 'Skipped'], ['all', 'All']].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{ borderRadius: 20, padding: '5px 13px', fontSize: 12.5, cursor: 'pointer', fontWeight: filter === id ? 600 : 400, border: `1px solid ${filter === id ? ACCENT : LINE}`, background: filter === id ? '#FBEADF' : '#fff', color: filter === id ? ACCENT : INK }}>{label} {counts[id] || 0}</button>
              ))}
            </div>
            {listView.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTE, padding: '6px 0' }}>{filter === 'toscore' ? 'Nothing waiting — generate a prompt and it lands here until you log how it did.' : 'Nothing here yet.'}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
                {listView.map((h) => {
                  const m = statusMeta(h)
                  const open = cur && cur.id === h.id
                  const waiting = (h.status === 'queued' || h.status === 'posted') && daysSince(h) >= 3
                  return (
                    <button key={h.id} onClick={() => openEntry(h)} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${open ? ACCENT : LINE}`, background: open ? '#FBEADF' : '#fff', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, display: 'block' }}>{h.scenario}{h.hook ? ' · hook' : ''}{h.multiShot ? ' · multi' : ''}</span>
                        <span style={{ fontSize: 12, color: MUTE, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || snippet(h.text)}</span>
                      </span>
                      <span style={{ fontSize: 11, textAlign: 'right', flexShrink: 0, color: waiting ? '#B07A0B' : MUTE }}>
                        <span style={{ display: 'block', color: m.color, fontWeight: 600 }}>{m.label}</span>
                        <span>{ago(h)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
