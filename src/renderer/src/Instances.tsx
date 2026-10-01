import { useEffect, useState } from 'react'
import { INK, PAPER, LINE, MUTE, ACCENT, INFO, GOOD, BAD, WARN, WAIT, MONO, lbl, sel, ghostBtn } from './ui'
import { PageHeader } from './Shell'
import type { AppConfig, DolaInstanceInfo, RenderOverview, LoginCheck } from '@shared/types'

function ago(iso?: string): string {
  if (!iso) return 'never'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}
const hhmm = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function stateOf(i: DolaInstanceInfo): { label: string; color: string } {
  if (i.excluded) return { label: 'Reserved', color: MUTE }
  if (i.busy) return { label: 'Rendering', color: INFO }
  if (i.loggedOutSince) return { label: `Logged out · since ${hhmm(i.loggedOutSince)}`, color: BAD }
  if (i.creditsOutUntil) return { label: `No credits · back ${hhmm(i.creditsOutUntil)}`, color: WARN }
  if (i.cooldownUntil) return { label: `Cooling down · until ${hhmm(i.cooldownUntil)}`, color: WARN }
  if (i.limitReached) return { label: 'Daily limit reached', color: WARN }
  if (i.loginCapReached) return { label: 'Login limit reached', color: WARN }
  return i.isInitialized ? { label: 'Ready', color: GOOD } : { label: 'Stopped', color: WAIT }
}

const small = { ...ghostBtn, padding: '4px 10px', fontSize: 12 }
const COLS = 'minmax(170px, 1.3fr) minmax(150px, 1.1fr) 120px 120px 100px 100px minmax(240px, 1.6fr)'
const card = { border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', background: 'var(--surface)' }
const num = (v: string): number => Math.max(0, Math.round(+v || 0))

/** Dola instance manager: every account at a glance — state, usage, and quick controls. */
export function Instances({ config, onConfig }: { config: AppConfig; onConfig: (c: AppConfig) => void }) {
  const [ov, setOv] = useState<RenderOverview | null>(null)
  const [err, setErr] = useState('')
  const [checks, setChecks] = useState<Record<number, LoginCheck>>({})
  const [checking, setChecking] = useState<number | 'all' | null>(null)
  const [checkMsg, setCheckMsg] = useState('')
  const refresh = (): Promise<void> => window.api.renderOverview().then(setOv).catch((e) => setErr(String(e?.message || e)))
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [])
  const run = (p: Promise<unknown>): void => { setErr(''); p.then(refresh).catch((e: any) => setErr(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))) }
  async function checkLogin(id?: number) {
    setErr(''); setChecking(id ?? 'all')
    try {
      const res = await window.api.instanceCheckLogin(id)
      setChecks((c) => ({ ...c, ...Object.fromEntries(res.map((x) => [x.id, x])) }))
      if (id == null) {
        const out = res.filter((x) => x.loggedIn === false), unk = res.filter((x) => x.loggedIn === null)
        setCheckMsg(`Checked ${res.length} running account${res.length === 1 ? '' : 's'}: ${res.length - out.length - unk.length} logged in` +
          (out.length ? ` · logged out: ${out.map((x) => x.name).join(', ')}` : '') + (unk.length ? ` · couldn't tell: ${unk.map((x) => x.name).join(', ')}` : ''))
      }
      await refresh()
    } catch (e: any) { setErr(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
    setChecking(null)
  }
  async function setRender(patch: Partial<AppConfig['render']>) { onConfig(await window.api.setConfig({ render: { ...config.render, ...patch } })); refresh() }

  const r = config.render
  const list = ov?.instances || []
  const active = list.filter((i) => !i.excluded)
  const todayTotal = list.reduce((n, i) => n + (i.sentToday || 0), 0)
  const readyNow = active.filter((i) => !i.busy && !i.creditsOutUntil && !i.cooldownUntil && !i.limitReached && !i.loggedOutSince && !i.loginCapReached).length
  const loggedOutCount = active.filter((i) => i.loggedOutSince).length
  const maxToday = Math.max(1, ...list.map((i) => i.sentToday || 0))

  return (
    <div style={{ minHeight: '100%', background: PAPER, color: INK }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 24px 32px', display: 'grid', gap: 14 }}>
        <PageHeader eyebrow="Dola instance manager · every account at a glance" title="Accounts">
          <button onClick={() => checkLogin()} disabled={checking !== null} title="Read every running account's page (no navigation, safe mid-render): a Dola 'Log In' button means logged out" style={ghostBtn}>{checking === 'all' ? 'Checking…' : 'Check all logins'}</button>
          <button onClick={() => refresh()} style={ghostBtn}>Refresh</button>
        </PageHeader>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div style={card}>
            <div style={lbl}>Today</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{ov ? `${ov.sentToday} / ${ov.dailyCap}` : '—'}</div>
            <div style={{ fontSize: 12, color: MUTE }}>renders sent (overall daily cap) · {readyNow} of {active.length} account{active.length === 1 ? '' : 's'} ready now{loggedOutCount ? <span style={{ color: BAD }}> · {loggedOutCount} logged out</span> : null}</div>
          </div>
          <div style={card}>
            <div style={lbl}>Picking the account</div>
            <select value={r.pickStrategy || 'balanced'} onChange={(e) => setRender({ pickStrategy: e.target.value as 'balanced' | 'first' })} style={sel}>
              <option value="balanced">Balanced — fewest renders today first</option>
              <option value="first">First free account</option>
            </select>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 5 }}>Balanced spreads the work so every account's daily credits get used. Busy, reserved, cooling-down and out-of-credit accounts are always skipped.</div>
          </div>
          <div style={card}>
            <div style={lbl}>Per-account daily limit</div>
            <input type="number" min={0} max={100} value={r.perAccountDailyCap ?? 0} onChange={(e) => setRender({ perAccountDailyCap: Math.max(0, Math.round(+e.target.value || 0)) })} style={{ ...sel, boxSizing: 'border-box' }} />
            <div style={{ fontSize: 12, color: MUTE, marginTop: 5 }}>0 = no limit. An account that reaches it is skipped until tomorrow.</div>
          </div>
          <div style={card}>
            <div style={lbl}>Dola logins</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ fontSize: 12, color: MUTE }}>Renders per login
                <input type="number" min={0} max={200} value={r.perLoginCap ?? 0} onChange={(e) => setRender({ perLoginCap: num(e.target.value) })} style={{ ...sel, boxSizing: 'border-box', marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 12, color: MUTE }}>Check every (min)
                <input type="number" min={0} max={240} value={r.loginCheckMinutes ?? 0} onChange={(e) => setRender({ loginCheckMinutes: num(e.target.value) })} style={{ ...sel, boxSizing: 'border-box', marginTop: 3 }} />
              </label>
            </div>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 5 }}>Logged-out accounts are always skipped and their render moves on. Renders per login (0 = off) rests an account before Dola logs it out — set it just under the "logged out after" numbers below. Check every 0 = only before each send, while waiting, and when you click.</div>
          </div>
          <div style={card}>
            <div style={lbl}>Warm-up before each video</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
              <input type="checkbox" checked={r.warmup ?? true} onChange={(e) => setRender({ warmup: e.target.checked })} style={{ accentColor: ACCENT, width: 15, height: 15 }} /> Say hello first
            </label>
            <input value={r.warmupMessage ?? 'Hi'} disabled={!(r.warmup ?? true)} onChange={(e) => setRender({ warmupMessage: e.target.value })} placeholder="Hi" style={{ ...sel, boxSizing: 'border-box', marginTop: 6 }} />
            <div style={{ fontSize: 12, color: MUTE, marginTop: 5 }}>New chat → this message → wait for Dola's reply → the video prompt in the same chat.</div>
          </div>
        </div>
        {checkMsg && <div style={{ fontSize: 12.5, color: MUTE }}>{checkMsg}</div>}

        {err && <div style={{ fontSize: 12.5, color: BAD }}>{err}</div>}
        {ov && ov.instances === null && <div style={{ fontSize: 13, color: BAD }}>DolaMultiBrowser not reachable: {ov.error}</div>}

        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '9px 14px', borderBottom: `1px solid ${LINE}`, ...lbl, marginBottom: 0 }}>
            <span>Account</span><span>State</span><span>Today</span><span title="Renders sent since the account last logged back in to Dola">Since login</span><span>All time</span><span>Last used</span><span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {!list.length && <div style={{ padding: 14, fontSize: 13, color: MUTE }}>{ov ? 'No Dola instances found in DolaMultiBrowser.' : 'Loading…'}</div>}
          {list.map((i) => {
            const st = stateOf(i)
            const done = (i.ok || 0) + (i.failed || 0)
            const rate = done ? Math.round(((i.ok || 0) / done) * 100) : null
            return (
              <div key={i.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '10px 14px', borderTop: `1px solid ${LINE}`, alignItems: 'center', fontSize: 13, opacity: i.excluded ? 0.65 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: MUTE }}>#{i.id} · {i.kind} · {i.status}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: st.color, fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />{st.label}</span>
                  {i.currentJob && <div style={{ fontSize: 11.5, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.currentJob}>{i.currentJob}</div>}
                  {i.loggedOutSince && <div style={{ fontSize: 11.5, color: MUTE }}>Log in again in DolaMultiBrowser, then Check login.</div>}
                  {checks[i.id] && !i.loggedOutSince && <div style={{ fontSize: 11.5, color: checks[i.id].loggedIn === null ? WARN : MUTE }} title={checks[i.id].reason}>{checks[i.id].loggedIn === true ? '✓ logged in' : checks[i.id].loggedIn === null ? `couldn't tell: ${checks[i.id].reason}` : ''}</div>}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{i.sentToday || 0}{(r.perAccountDailyCap ?? 0) > 0 ? ` / ${r.perAccountDailyCap}` : ''}</div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', marginTop: 4 }}><div style={{ height: 5, borderRadius: 3, width: `${((i.sentToday || 0) / ((r.perAccountDailyCap ?? 0) > 0 ? r.perAccountDailyCap! : maxToday)) * 100}%`, maxWidth: '100%', background: i.limitReached ? WARN : ACCENT }} /></div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: i.loginCapReached ? WARN : undefined }}>
                    {i.sinceLogin || 0}{(r.perLoginCap ?? 0) > 0 ? ` / ${r.perLoginCap}` : ''}
                    {(i.sinceLogin || 0) > 0 && <button onClick={() => run(window.api.instanceResetLoginCount(i.id))} title="Start the since-login count again (e.g. after logging out and in by hand)" style={{ background: 'none', border: 'none', color: MUTE, cursor: 'pointer', fontSize: 11, padding: '0 0 0 5px' }}>↺</button>}
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTE }} title="Renders it had sent each time Dola logged it out (newest last)">{i.logoutsAfter?.length ? `logged out after ${i.logoutsAfter.slice(-4).join(', ')}` : 'no logouts seen'}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{i.total || 0}</div>
                  <div style={{ fontSize: 11.5, color: MUTE }}>{rate === null ? 'no results yet' : `${rate}% ok · ${i.failed || 0} failed`}</div>
                </div>
                <div style={{ fontSize: 12.5, color: MUTE }}>{ago(i.lastUsed)}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!i.isInitialized && <button onClick={() => run(window.api.instanceStart(i.id))} style={small}>Start</button>}
                  {i.isInitialized && <button onClick={() => run(window.api.instanceShow(i.id))} title="Bring this account on screen in DolaMultiBrowser" style={i.loggedOutSince ? { ...small, color: ACCENT, borderColor: ACCENT } : small}>{i.loggedOutSince ? 'Open to log in' : 'Show'}</button>}
                  {i.isInitialized && <button onClick={() => checkLogin(i.id)} disabled={checking !== null} title="Is Dola logged in on this account? Reads the page as it is" style={small}>{checking === i.id ? 'Checking…' : 'Check login'}</button>}
                  {i.cooldownUntil && <button onClick={() => run(window.api.renderClearCooldown(i.id))} style={small}>End cooldown</button>}
                  {i.creditsOutUntil && <button onClick={() => run(window.api.instanceClearCredits(i.id))} title="Use if this account was topped up or Dola reset early" style={small}>End credit rest</button>}
                  <button onClick={() => run(window.api.instanceReserve(i.id, !i.excluded).then(onConfig))} title={i.excluded ? 'Let the Studio render on this account again' : 'Keep this account for other work — the Studio never renders on it'} style={{ ...small, color: i.excluded ? ACCENT : MUTE }}>{i.excluded ? 'Unreserve' : 'Reserve'}</button>
                  <button onClick={() => { if (confirm(`Reset the usage counters for ${i.name}?`)) run(window.api.instanceResetUsage(i.id)) }} title="Reset this account's usage counters" style={{ ...small, color: MUTE }}>↺</button>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 12, color: MUTE }}>Today's total across accounts: {todayTotal}. Counts are kept per local day and updated as renders are sent; results count when a render finishes or fails.</div>
      </div>
    </div>
  )
}
