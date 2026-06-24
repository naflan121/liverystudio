import type { CSSProperties } from 'react'

export const INK = '#1C1B19'
export const PAPER = '#FBFAF7'
export const LINE = '#DAD6CC'
export const MUTE = '#6B6862'
export const ACCENT = '#E85D1A'
export const GOOD = '#1F7A4D'
export const BAD = '#B23A2E'
export const VIRAL = '#B8389E'
export const WAIT = '#9A968C'
export const SCREEN = '#1A1915'
export const SCREEN_TX = '#ECE7DB'

export const lbl: CSSProperties = { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: MUTE, fontWeight: 600, marginBottom: 7 }
export const sel: CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 14, background: '#fff', color: INK }
export const ghostBtn: CSSProperties = { background: '#fff', color: INK, border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }
export const primaryBtn: CSSProperties = { width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }
export const card: CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 12, background: PAPER }
