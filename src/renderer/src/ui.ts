import type { CSSProperties } from 'react'

// Every colour is a theme token (see theme.css), so both themes work everywhere.
export const INK = 'var(--ink)'
export const PAPER = 'var(--bg)'
export const SURFACE = 'var(--surface)'
export const SURFACE2 = 'var(--surface-2)'
export const LINE = 'var(--line)'
export const MUTE = 'var(--mute)'
/** Brand + primary actions. Not a status colour — use INFO for "in progress". */
export const ACCENT = 'var(--accent)'
export const ACCENT_SOFT = 'var(--accent-soft)'
export const INFO = 'var(--info)'
export const INFO_SOFT = 'var(--info-soft)'
export const GOOD = 'var(--good)'
export const GOOD_SOFT = 'var(--good-soft)'
export const WARN = 'var(--warn)'
export const BAD = 'var(--bad)'
export const BAD_SOFT = 'var(--bad-soft)'
export const VIRAL = 'var(--viral)'
export const WAIT = 'var(--wait)'
export const SCREEN = 'var(--screen)'
export const SCREEN_TX = 'var(--screen-tx)'
export const DISPLAY = 'var(--f-display)'
export const MONO = 'var(--f-mono)'

export const lbl: CSSProperties = { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: MUTE, fontWeight: 600, marginBottom: 7 }
export const sel: CSSProperties = { width: '100%', padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 14, background: SURFACE, color: INK }
export const ghostBtn: CSSProperties = { background: SURFACE, color: INK, border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }
export const primaryBtn: CSSProperties = { width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }
export const card: CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 12, background: SURFACE }
/** Page heading pieces shared by every screen inside the shell. */
export const eyebrow: CSSProperties = { fontFamily: DISPLAY, fontSize: 13, letterSpacing: 2.4, textTransform: 'uppercase', color: MUTE, fontWeight: 600 }
export const pageTitle: CSSProperties = { fontFamily: DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.05, margin: 0 }
