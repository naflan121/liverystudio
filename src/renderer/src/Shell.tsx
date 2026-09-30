import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DISPLAY, MONO, INFO, GOOD, WARN, BAD, MUTE, INK, LINE, ACCENT, SCREEN, SCREEN_TX } from './ui'
import type { LogLine, LogLevel, RenderOverview } from '@shared/types'

export type View = 'today' | 'lab' | 'renders' | 'review' | 'history' | 'settings'
export type Theme = 'dark' | 'light' | 'system'

const THEME_KEY = 'studio.theme'
export function loadTheme(): Theme {
  try { const t = localStorage.getItem(THEME_KEY) as Theme | null; return t === 'light' || t === 'system' || t === 'dark' ? t : 'dark' } catch { return 'dark' }
}
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem(THEME_KEY, t) } catch { /* per-device preference only */ }
}

// Simple 1.6px-stroke glyphs; currentColor so they follow the nav state.
const ICONS: Record<View, ReactNode> = {
  today: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h5l2-3 3 6 2-3h5" /></>,
  lab: <><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" /><path d="M14 6l3 3" /></>,
  renders: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5z" /></>,
  review: <><path d="M4 12.5l4.5 4.5L20 6" /></>,
  history: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
}

const NAV: { group: string; items: { id: View; label: string }[] }[] = [
  { group: '', items: [{ id: 'today', label: 'Today' }] },
  { group: 'Pipeline', items: [{ id: 'lab', label: 'Create' }, { id: 'renders', label: 'Renders' }, { id: 'review', label: 'Review' }, { id: 'history', label: 'Library' }] },
  { group: 'System', items: [{ id: 'settings', label: 'Settings' }] },
]

const LOG_COLORS: Record<LogLevel, string> = { info: '#9c968a', step: '#f2a55e', ok: '#7fc59c', warn: '#e2b53c', err: '#ff8a6b' }
function logTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Horizon mark: a tiny attitude indicator. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="var(--line)" strokeWidth="1.5" />
      <path d="M2.5 14.2 L23.5 11.8 A11.5 11.5 0 0 1 2.5 14.2 Z" fill="var(--accent)" opacity=".9" />
      <path d="M8 13h3.5M14.5 13H18M13 11v4" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Shell({ view, onNav, counts, overview, logs, onClearLogs, busy, theme, onTheme, children }: {
  view: View
  onNav: (v: View) => void
  counts: Partial<Record<View, { n: number; tone: 'info' | 'attention' }>>
  overview: RenderOverview | null
  logs: LogLine[]
  onClearLogs: () => void
  /** Something in this window is working (writing a prompt, teaching the playbook…). */
  busy: string
  theme: Theme
  onTheme: (t: Theme) => void
  children: ReactNode
}) {
  const [drawer, setDrawer] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { if (drawer && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, [logs, drawer])

  const last = logs[logs.length - 1]
  const inst = overview?.instances || []
  const rendering = inst.filter((i) => i.busy).length
  const ready = inst.filter((i) => i.isInitialized && !i.busy && !i.excluded && !i.cooldownUntil).length
  const cooling = inst.filter((i) => i.cooldownUntil).length
  const cap = overview?.dailyCap ?? 0
  const sent = overview?.sentToday ?? 0

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '216px minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr) auto', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <nav style={{ gridRow: '1 / 2', background: 'var(--sidebar)', borderRight: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', padding: '16px 10px 12px', gap: 14, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px 6px' }}>
          <Mark />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, letterSpacing: 1.2, textTransform: 'uppercase' }}>Livery Studio</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: MUTE, marginTop: 4, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>video engine · v0.3</div>
          </div>
        </div>
        {NAV.map((g) => (
          <div key={g.group || 'top'} style={{ display: 'grid', gap: 2 }}>
            {g.group && <div style={{ fontFamily: DISPLAY, fontSize: 11.5, letterSpacing: 2, textTransform: 'uppercase', color: MUTE, fontWeight: 600, padding: '4px 10px' }}>{g.group}</div>}
            {g.items.map((it) => {
              const on = view === it.id
              const c = counts[it.id]
              return (
                <button key={it.id} onClick={() => onNav(it.id)} aria-current={on ? 'page' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontWeight: on ? 600 : 500, color: on ? INK : MUTE, background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? 'var(--shadow)' : 'none' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: on ? ACCENT : 'currentColor', flexShrink: 0 }}>{ICONS[it.id]}</svg>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {c && c.n > 0 && (
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, minWidth: 20, textAlign: 'center', padding: '1px 6px', borderRadius: 10, color: c.tone === 'attention' ? '#fff' : INFO, background: c.tone === 'attention' ? INFO : 'var(--info-soft)' }}>{c.n}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        <div style={{ marginTop: 'auto', display: 'grid', gap: 6, padding: '0 6px' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 11.5, letterSpacing: 2, textTransform: 'uppercase', color: MUTE, fontWeight: 600, padding: '0 4px' }}>Appearance</div>
          <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: 'var(--track)', borderRadius: 8, padding: 2 }}>
            {(['dark', 'light', 'system'] as Theme[]).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => onTheme(t)} style={{ border: 'none', borderRadius: 6, padding: '5px 0', fontSize: 11.5, cursor: 'pointer', fontWeight: 600, color: theme === t ? INK : MUTE, background: theme === t ? 'var(--surface)' : 'transparent' }}>{t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </nav>

      {/* Page */}
      <main style={{ gridRow: '1 / 2', overflowY: 'auto', minWidth: 0 }}>{children}</main>

      {/* Status bar + activity drawer */}
      <footer style={{ gridColumn: '1 / -1', borderTop: `1px solid ${LINE}`, background: 'var(--sidebar)' }}>
        {drawer && (
          <div ref={boxRef} style={{ height: 240, overflowY: 'auto', background: SCREEN, padding: '10px 16px', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7 }}>
            {logs.length === 0
              ? <div style={{ color: '#55524a' }}>Waiting for activity…</div>
              : logs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <span style={{ color: '#55524a', flexShrink: 0 }}>{logTime(l.ts)}</span>
                  <span style={{ color: LOG_COLORS[l.level], flex: 1 }}>{l.msg}</span>
                </div>
              ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '6px 14px', fontSize: 12, color: MUTE, minHeight: 32, flexWrap: 'wrap' }}>
          {overview?.instances === null
            ? <span style={{ color: BAD }}>● DolaMultiBrowser offline</span>
            : (
              <span title="Dola accounts" style={{ display: 'inline-flex', gap: 10 }}>
                <span><b style={{ color: INFO, fontWeight: 600 }}>● {rendering}</b> rendering</span>
                <span><b style={{ color: GOOD, fontWeight: 600 }}>● {ready}</b> ready</span>
                {cooling > 0 && <span><b style={{ color: WARN, fontWeight: 600 }}>● {cooling}</b> cooling</span>}
              </span>
            )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} title="Renders sent to Dola today">
            Sent today <b style={{ fontFamily: MONO, color: INK, fontWeight: 500 }}>{sent}/{cap}</b>
            <span style={{ width: 60, height: 4, borderRadius: 3, background: 'var(--track)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${cap ? Math.min(100, (sent / cap) * 100) : 0}%`, background: sent >= cap && cap > 0 ? BAD : ACCENT }} />
            </span>
          </span>
          {busy && <span style={{ color: INFO, display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${LINE}`, borderTopColor: INFO, animation: 'll-spin .8s linear infinite' }} />{busy}</span>}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 11.5 }}>
            {last ? <><span style={{ opacity: 0.6 }}>{logTime(last.ts)}</span> {last.msg}</> : ''}
          </span>
          {drawer && <button onClick={onClearLogs} style={{ background: 'transparent', border: `1px solid ${LINE}`, color: MUTE, borderRadius: 6, padding: '2px 9px', fontSize: 11.5, cursor: 'pointer' }}>Clear</button>}
          <button onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} style={{ background: 'transparent', border: `1px solid ${LINE}`, color: INK, borderRadius: 6, padding: '2px 10px', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}>Activity {drawer ? '▾' : '▴'} <span style={{ fontFamily: MONO, color: MUTE, fontWeight: 400 }}>{logs.length}</span></button>
        </div>
      </footer>
    </div>
  )
}

/** Shared page header: eyebrow + big condensed title + optional actions. */
export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: 2.4, textTransform: 'uppercase', color: MUTE, fontWeight: 600 }}>{eyebrow}</div>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.05, margin: '2px 0 0' }}>{title}</h1>
      </div>
      {children && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}
