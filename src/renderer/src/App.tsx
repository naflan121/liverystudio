import { useState, useEffect, useCallback, useMemo } from 'react'
import { MUTE } from './ui'
import type { AppConfig, Entry, LogLine, RenderJob, RenderOverview } from '@shared/types'
import { Settings } from './Settings'
import { Library } from './Library'
import { Renders, RENDER_META, latestJobByEntry } from './Renders'
import { Review } from './Review'
import { Shell, loadTheme, applyTheme, type View, type Theme } from './Shell'
import { Today } from './Today'
import { useLab } from './lab/useLab'
import { Lab } from './lab/Lab'

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [view, setView] = useState<View>('today')
  const [theme, setTheme] = useState<Theme>(loadTheme)
  useEffect(() => { applyTheme(theme) }, [theme])
  const [overview, setOverview] = useState<RenderOverview | null>(null)
  const [renderJobs, setRenderJobs] = useState<RenderJob[]>([])
  const latestRender = useMemo(() => latestJobByEntry(renderJobs), [renderJobs])
  const liveRenders = renderJobs.filter((j) => RENDER_META[j.status].live).length
  const awaitingReview = renderJobs.filter((j) => j.status === 'done' && j.file && !j.review).length
  const [history, setHistory] = useState<Entry[]>([])
  const [playbook, setPlaybook] = useState('')
  const [logs, setLogs] = useState<LogLine[]>([])

  useEffect(() => {
    (async () => {
      const cfg = await window.api.getConfig()
      setConfig(cfg)
      setHistory(await window.api.getHistory())
      setPlaybook(await window.api.getPlaybook())
    })()
  }, [])

  // Dola accounts + today's cap for the status bar and Today (cheap: one Control API call).
  useEffect(() => {
    let alive = true
    const load = (): void => { window.api.renderOverview().then((o) => { if (alive) setOverview(o) }).catch(() => { /* ignore */ }) }
    load()
    const t = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(t) }
  }, [renderJobs])

  // Render jobs are owned by the main process; mirror them here.
  useEffect(() => {
    window.api.renderOverview().then((o) => setRenderJobs(o.jobs)).catch(() => { /* ignore */ })
    return window.api.onRenderChanged((jobs) => setRenderJobs([...jobs]))
  }, [])

  // The main process can add/update prompts on its own (e.g. a rewrite after rejected renders).
  useEffect(() => window.api.onHistoryChanged(() => { window.api.getHistory().then(setHistory).catch(() => { /* ignore */ }) }), [])

  // A clicked notification opens the screen it is about.
  useEffect(() => window.api.onNav((v) => setView(v as View)), [])

  // Stream backend activity into the terminal-style log (cap at 500 lines).
  // Guarded: if the preload is stale and lacks onLog, skip rather than crash.
  useEffect(() => {
    if (typeof window.api?.onLog !== 'function') return
    const off = window.api.onLog((line) => setLogs((prev) => [...prev.slice(-499), line]))
    return off
  }, [])

  // Race-safe persistence: always derive the next history from the LATEST state
  // via a functional update. Plain `persist([entry, ...history])` captured a
  // stale `history` in async closures (e.g. the scene-identify callback after
  // scoring), so a slow background step could silently clobber entries added
  // in the meantime. The disk write rides inside the updater — idempotent, so
  // a double-invoke in dev StrictMode is harmless. Only entries that are new or
  // changed (new object identity) are sent; the database upserts them by id.
  const persist = useCallback((updater: (prev: Entry[]) => Entry[]) => {
    setHistory((prev) => {
      const next = updater(prev)
      const before = new Set(prev)
      const changed = next.filter((e) => !before.has(e))
      if (changed.length) window.api.setHistory(changed).catch(() => { /* ignore */ })
      return next
    })
  }, [])

  const lab = useLab({ config, history, persist, setPlaybook })
  const { openEntry, cur, loading, conceptLoading, captioning, learning, setCurrent } = lab

  async function clearAll() {
    try { await window.api.resetMemory() } catch { /* ignore */ }
    setHistory([]); setCurrent(null); setPlaybook('')
  }

  if (!config) {
    return <div style={{ padding: 40, fontFamily: 'ui-sans-serif, system-ui', color: MUTE }}>Loading…</div>
  }

  const settingsView = (
    <Settings config={config} onSave={setConfig} onClose={() => setView('lab')} playbook={playbook} onPlaybook={setPlaybook} onResetMemory={clearAll} />
  )
  const reviewView = (
    <Review entries={history} jobs={renderJobs} onOpenEntry={(h) => { openEntry(h); setView('lab') }} onClose={() => setView('lab')} />
  )
  const rendersView = (
    <Renders refsDefault={config.render?.referenceImages !== false} entries={history} jobs={renderJobs} onOpenEntry={(h) => { openEntry(h); setView('lab') }} onClose={() => setView('lab')}
      onRefresh={async () => { const r = await window.api.refreshHistory(); setHistory(r.history); return r.added }} />
  )
  const historyView = (
    <Library entries={history} jobs={renderJobs} openId={cur?.id ?? null} onOpen={(h) => { openEntry(h); setView('lab') }} />
  )
  const brainView = (
    <Settings mode="brain" config={config} onSave={setConfig} onClose={() => setView('lab')} playbook={playbook} onPlaybook={setPlaybook} onResetMemory={clearAll} />
  )

  const toScore = history.filter((h) => h.status === 'posted').length
  const lu = lab.lineup
  const busy = lu?.running ? `Batch lineup: ${lu.items.filter((i) => i.status === 'written' || i.status === 'queued').length}/${lu.total} written…` : loading ? 'Writing prompt…' : conceptLoading ? 'Inventing a concept…' : captioning ? 'Writing caption…' : learning ? 'Teaching playbook…' : ''
  const capLeft = overview ? Math.max(0, overview.dailyCap - overview.sentToday) : null
  const labView = <Lab lab={lab} config={config} history={history} playbook={playbook} latestRender={latestRender} capLeft={capLeft} dailyCap={overview?.dailyCap ?? config.render.dailyCap} />
  const page = view === 'today'
    ? <Today entries={history} jobs={renderJobs} overview={overview} onNav={setView} onOpenEntry={(h) => { openEntry(h); setView('lab') }} onLineup={() => { lab.setLineupOpen(true); setView('lab') }} />
    : view === 'lab' ? labView
      : view === 'renders' ? rendersView
        : view === 'review' ? reviewView
          : view === 'history' ? historyView
            : view === 'brain' ? brainView
              : settingsView

  return (
    <Shell view={view} onNav={setView} overview={overview} logs={logs} onClearLogs={() => setLogs([])} busy={busy} theme={theme} onTheme={setTheme}
      counts={{ renders: { n: liveRenders, tone: 'info' }, review: { n: awaitingReview, tone: 'attention' }, history: { n: toScore, tone: 'info' } }}>
      {page}
    </Shell>
  )
}
