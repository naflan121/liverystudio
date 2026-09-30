import { useState } from 'react'
import { ACCENT, MUTE, WAIT } from '../ui'
import { REACH } from '@shared/domain'
import type { Entry } from '@shared/types'

export function copyText(s: string) {
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

export function CopyBtn({ text, style, label }: { text: string; style?: React.CSSProperties; label?: string }) {
  const [done, setDone] = useState(false)
  return <button onClick={() => { copyText(text); setDone(true); setTimeout(() => setDone(false), 1300) }} style={style}>{done ? 'Copied' : (label || 'Copy')}</button>
}

export function statusMeta(h: Entry) {
  if (h.status === 'scored') { const r = REACH.find((x) => x.id === h.reach); return { label: r ? r.label : 'Scored', color: r ? r.color : 'var(--good)' } }
  if (h.status === 'posted') return { label: 'Posted', color: ACCENT }
  if (h.status === 'skipped') return { label: 'Skipped', color: MUTE }
  return { label: 'Awaiting', color: WAIT }
}
export function ago(h: Entry, posted?: boolean) {
  const base = posted && h.postedAt ? h.postedAt : new Date(h.ts).getTime()
  const d = Math.floor((Date.now() - base) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 7) return d + ' days ago'
  const w = Math.floor(d / 7)
  return w + (w === 1 ? ' week ago' : ' weeks ago')
}
