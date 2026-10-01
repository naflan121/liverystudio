// Windows notifications for high-level pipeline events (Settings → Notifications).

import { BrowserWindow, Notification } from 'electron'
import { getConfig } from './store'
import type { NotifySettings } from '../shared/types'

export type NotifyKind = keyof Pick<NotifySettings, 'renderDone' | 'renderFailed' | 'capReached' | 'queuePaused' | 'autoRetry' | 'creditsOut' | 'loggedOut' | 'connectionError'>

let getWin: () => BrowserWindow | null = () => null

export function initNotify(win: () => BrowserWindow | null): void { getWin = win }

/**
 * Show a notification if its kind is switched on. `view` is the Studio screen to
 * open when it's clicked. `force` skips the settings (used by the Test button).
 */
export function notify(kind: NotifyKind | 'test', title: string, body: string, view?: string, force = false): boolean {
  const cfg = getConfig().notify
  if (!force) {
    if (!cfg.enabled || (kind !== 'test' && !cfg[kind])) return false
    const w = getWin()
    if (cfg.onlyWhenUnfocused && w && !w.isDestroyed() && w.isFocused() && w.isVisible() && !w.isMinimized()) return false
  }
  if (!Notification.isSupported()) return false
  const n = new Notification({ title, body, silent: kind === 'renderDone' })
  n.on('click', () => {
    const w = getWin()
    if (!w || w.isDestroyed()) return
    if (w.isMinimized()) w.restore()
    w.show(); w.focus()
    if (view) w.webContents.send('nav', view)
  })
  n.show()
  return true
}
