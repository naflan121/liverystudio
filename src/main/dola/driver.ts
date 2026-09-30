// Drives DolaMultiBrowser instances: Control API (list/start) + CDP via Playwright
// (new chat -> Pro -> Generate Videos skill -> prompt -> send -> wait -> fallback_api).
// Ported from FangyueBrowser-Fork/mcp/dola-mcp/index.js — keep the selectors and the
// busy-retry timings in step with that file when Dola's UI changes.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { findFallbackApis } from './resolver'

const CHAT_URL = 'https://www.dola.com/chat/'
const SEL = {
  editor: '[data-testid="chat_input_input"] .ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"]',
  send: '[data-testid="chat_input_send_button"]',
  modeButton: 'button',
  modeItem: { Fast: '[data-testid="deep-thinking-action-item-0"]', Pro: '[data-testid="deep-thinking-action-item-4"]' } as Record<string, string>,
  slashOption: '[role="listbox"] [role="option"]',
  reply: '[data-testid="receive_message"]',
  regenerate: '[data-testid="message_action_regenerate"]',
}

// Dola's "The service is experiencing high demand. Please try again later." reply.
export const BUSY_RE = /high demand|try again later/i
const BUSY_RETRY = { attempts: 5, intervalSec: 60 }
const VIDEO_SKILL = { command: '/creative-video', option: 'Generate Videos' }
const VIDEO_EXTRA = ['NotifyHuman Artifacts', 'Dont ask me any more confirmation go ahead']

export class Cancelled extends Error { constructor() { super('Cancelled') } }
export type CancelCheck = () => boolean
const checkCancel = (c?: CancelCheck): void => { if (c?.()) throw new Cancelled() }

// ---------- Control API ----------

export interface ControlInstance {
  id: number
  name: string
  kind: string
  status: string
  isInitialized: boolean
  debugPort: number | null
  webSocketDebuggerUrl: string | null
}

function loadApiConfig(): { base: string; token: string } {
  const cfgPath = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'DolaMultiBrowser', 'config.json')
  let port = 9333, token = ''
  try {
    const api = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).ControlApi ?? {}
    port = api.Port ?? port
    token = api.Token ?? ''
  } catch { /* reported below as "no token" */ }
  return { base: `http://127.0.0.1:${process.env.DOLA_API_PORT ?? port}/api/v1`, token: process.env.DOLA_API_TOKEN ?? token }
}

async function api<T>(method: string, route: string): Promise<T> {
  const { base, token } = loadApiConfig() // re-read each call so token/port changes need no restart
  if (!token) throw new Error('No DolaMultiBrowser Control API token. Enable ControlApi in %LOCALAPPDATA%\\DolaMultiBrowser\\config.json and restart DolaMultiBrowser.')
  let res: Response
  try {
    res = await fetch(base + route, { method, headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new Error(`DolaMultiBrowser Control API not reachable at ${base}. Is DolaMultiBrowser running with ControlApi.Enabled = true?`)
  }
  const body: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Control API ${method} ${route} -> ${res.status}: ${body.error ?? JSON.stringify(body)}`)
  return body as T
}

export const listInstances = async (): Promise<ControlInstance[]> => (await api<{ instances: ControlInstance[] }>('GET', '/instances')).instances

export async function startInstance(id: number): Promise<ControlInstance> {
  forget(id)
  return api<ControlInstance>('POST', `/instances/${id}/start`)
}

/**
 * Bring an instance on screen in DolaMultiBrowser. The app shows ONE instance at a time;
 * every other running instance's page is detached from the window and stops being drawn,
 * so its chat box can't be clicked or typed into. Call before typing; afterwards the job
 * can wait and download off-screen.
 */
export async function showInstance(id: number): Promise<void> {
  try {
    await api<ControlInstance>('POST', `/instances/${id}/show`)
  } catch (e: any) {
    if (/-> 404/.test(e?.message || '')) throw new Error('This DolaMultiBrowser build has no "show instance" command. Rebuild/restart DolaMultiBrowser (see CONTROL_API.md), or keep the rendering instance on screen.')
    throw e
  }
}

/** True once the page is actually being drawn (animation frames run only for a visible page). */
export async function waitUntilDrawn(page: Page, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const drawn = await page.evaluate(() => new Promise<boolean>((res) => {
      let done = false
      requestAnimationFrame(() => { done = true; res(true) })
      setTimeout(() => { if (!done) res(false) }, 1000)
    })).catch(() => false)
    if (drawn) return true
  }
  return false
}

// ---------- CDP connections (one per instance, reused) ----------

const connections = new Map<number, { wsUrl: string; browser: Browser }>()

export async function getPage(id: number): Promise<{ inst: ControlInstance; page: Page }> {
  const inst = (await listInstances()).find((i) => i.id === id)
  if (!inst) throw new Error(`No Dola instance with id ${id}.`)
  if (!inst.isInitialized || !inst.webSocketDebuggerUrl) throw new Error(`Instance ${id} (${inst.name}) is not running (status: ${inst.status}).`)
  let conn = connections.get(id)
  if (!conn || conn.wsUrl !== inst.webSocketDebuggerUrl || !conn.browser.isConnected()) {
    const browser = await chromium.connectOverCDP(inst.webSocketDebuggerUrl)
    conn = { wsUrl: inst.webSocketDebuggerUrl, browser }
    connections.set(id, conn)
  }
  // WebView2 hosts exactly one visible page; CDP-created tabs are invisible and can't be
  // closed, so always drive the existing page rather than opening a new one.
  const pages = conn.browser.contexts().flatMap((c) => c.pages())
  const page = pages.find((p) => p.url().startsWith('https://www.dola.com')) ?? pages[0]
  if (!page) throw new Error(`Instance ${id} has no open page.`)
  return { inst, page }
}

export function forget(id: number): void {
  const conn = connections.get(id)
  connections.delete(id)
  conn?.browser.close().catch(() => { /* disconnect only; never close pages */ })
}

// ---------- Page operations ----------

async function openNewChat(page: Page): Promise<void> {
  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator(SEL.editor).first().waitFor({ state: 'visible', timeout: 30_000 })
}

// Dola resets to Fast on every new chat, so this must run after openNewChat.
async function setMode(page: Page, mode: 'Fast' | 'Pro'): Promise<void> {
  const btn = page.locator(SEL.modeButton).filter({ hasText: /^(Fast|Pro)$/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 15_000 })
  if ((await btn.innerText()).trim() === mode) return
  await btn.click()
  await page.locator(SEL.modeItem[mode]).click({ timeout: 10_000 })
  for (let i = 0; i < 20 && (await btn.innerText()).trim() !== mode; i++) await page.waitForTimeout(150)
  if ((await btn.innerText()).trim() !== mode) throw new Error(`Could not switch Dola model to ${mode}.`)
}

async function clearEditor(page: Page): Promise<void> {
  const editor = page.locator(SEL.editor).first()
  await editor.waitFor({ state: 'visible', timeout: 30_000 })
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}

// insertText (not Enter) so newlines become paragraphs instead of sending.
async function typePrompt(page: Page, prompt: string): Promise<void> {
  await page.keyboard.insertText(prompt)
  const send = page.locator(SEL.send)
  await send.waitFor({ state: 'visible', timeout: 10_000 })
  for (let i = 0; i < 20 && await send.isDisabled(); i++) await page.waitForTimeout(250)
  if (await send.isDisabled()) throw new Error('Prompt typed but the send button stayed disabled.')
}

/** New chat -> Pro -> "Generate Videos" skill -> settings block -> [instructions] -> prompt (not sent). */
export async function fillVideoPrompt(page: Page, o: { prompt: string; model: string; duration: string; aspect: string; instructions?: string; references?: string }): Promise<void> {
  await openNewChat(page)
  await setMode(page, 'Pro')
  await clearEditor(page)
  await page.keyboard.type(VIDEO_SKILL.command)
  await page.locator(SEL.slashOption).filter({ hasText: VIDEO_SKILL.option }).first().click({ timeout: 10_000 })
  await page.waitForTimeout(300)
  const header = [o.model, o.duration, o.aspect, ...VIDEO_EXTRA].join('\n')
  // Optional blocks between the settings lines and the prompt: standing instructions, then the reference-images request.
  const parts = [header, o.instructions?.trim(), o.references?.trim(), o.prompt].filter(Boolean)
  await typePrompt(page, parts.join('\n\n'))
}

const lastReplyText = (page: Page): Promise<string | null> => page.evaluate((sel) => {
  const all = document.querySelectorAll(sel)
  const r = all[all.length - 1] as HTMLElement | undefined
  return r ? r.innerText.trim() : null
}, SEL.reply)

// A reply can show a loading placeholder before turning into the busy error, so re-check after a pause.
async function stillNotBusyAfter(page: Page, ms: number): Promise<boolean> {
  const text = await lastReplyText(page)
  if (!text || BUSY_RE.test(text)) return false
  await page.waitForTimeout(ms)
  return !BUSY_RE.test((await lastReplyText(page)) ?? '')
}

async function waitForFirstReply(page: Page, before: number, timeoutMs = 60_000): Promise<'busy' | 'started'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await page.locator(SEL.reply).count() > before) {
      const text = await lastReplyText(page)
      if (text && BUSY_RE.test(text)) return 'busy'
      if (text) return (await stillNotBusyAfter(page, 10_000)) ? 'started' : 'busy'
    }
    await page.waitForTimeout(2000)
  }
  return BUSY_RE.test((await lastReplyText(page)) ?? '') ? 'busy' : 'started'
}

// Press Regenerate on the last reply while it is the high-demand error.
async function retryWhileBusy(page: Page, cancel?: CancelCheck): Promise<'started' | 'still_busy'> {
  for (let i = 1; i <= BUSY_RETRY.attempts; i++) {
    checkCancel(cancel)
    if (!BUSY_RE.test((await lastReplyText(page)) ?? '')) return 'started'
    const reply = page.locator(SEL.reply).last()
    await reply.hover().catch(() => { /* ignore */ })
    await reply.locator(SEL.regenerate).click({ timeout: 10_000 })
    const deadline = Date.now() + BUSY_RETRY.intervalSec * 1000
    await page.waitForTimeout(5000)
    while (Date.now() < deadline) {
      if (await stillNotBusyAfter(page, 10_000)) return 'started'
      await page.waitForTimeout(3000)
    }
  }
  return BUSY_RE.test((await lastReplyText(page)) ?? '') ? 'still_busy' : 'started'
}

/** Click send, then ride out Dola's "high demand" replies. Returns the chat URL. */
export async function sendAndHandleBusy(page: Page, cancel?: CancelCheck): Promise<{ url: string; status: 'started' | 'still_busy' }> {
  const before = await page.locator(SEL.reply).count()
  const startUrl = page.url()
  await page.locator(SEL.send).click()
  await page.waitForURL((u) => u.href !== startUrl, { timeout: 15_000 }).catch(() => { /* ignore */ })
  const first = await waitForFirstReply(page, before)
  if (first !== 'busy') return { url: page.url(), status: first }
  return { url: page.url(), status: await retryWhileBusy(page, cancel) }
}

// Reload the chat (or open chatUrl) and collect fallback_api URLs from the conversation's data.
async function captureFallbackApis(page: Page, chatUrl?: string): Promise<string[]> {
  const apis: string[] = []
  const pending: Promise<void>[] = []
  const onResponse = (res: any): void => {
    if (!res.url().includes('/im/chain/single')) return
    pending.push(res.text().then((body: string) => { for (const u of findFallbackApis(body)) if (!apis.includes(u)) apis.push(u) }).catch(() => { /* ignore */ }))
  }
  page.on('response', onResponse)
  try {
    if (chatUrl) await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    else await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => { /* ignore */ })
    await page.waitForTimeout(2000)
    await Promise.all(pending)
  } finally {
    page.off('response', onResponse)
  }
  return apis
}

const lastReplyHasVideo = (page: Page): Promise<boolean> => page.evaluate((sel) => {
  const all = document.querySelectorAll(sel)
  return !!all[all.length - 1]?.querySelector('video')
}, SEL.reply)

/**
 * Poll until the chat has a generated video; returns its fallback_api URLs (newest last).
 * Reloads only when a video shows in the last reply, or every 3rd poll as a fallback.
 * chatUrl pins the wait to one conversation: if the page wandered off, it is reopened.
 */
export async function waitForVideo(page: Page, o: { chatUrl?: string; waitMinutes: number; cancel?: CancelCheck }): Promise<string[]> {
  const deadline = Date.now() + o.waitMinutes * 60_000
  for (let poll = 0; ; poll++) {
    checkCancel(o.cancel)
    if (o.chatUrl && page.url() !== o.chatUrl) await page.goto(o.chatUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    if (BUSY_RE.test((await lastReplyText(page)) ?? '')) throw new Error('Dola replied with the high-demand error.')
    if (await lastReplyHasVideo(page) || poll % 3 === 2 || Date.now() > deadline) {
      const apis = await captureFallbackApis(page, o.chatUrl)
      if (apis.length) return apis
    }
    if (Date.now() > deadline)
      throw new Error(`No video in the Dola chat after ${o.waitMinutes} min. If Dola finished without attaching it, ask it in the chat to deliver the video as NotifyHuman Artifacts, then Retry.`)
    // Sleep in short steps so Cancel takes effect quickly.
    for (let s = 0; s < 12; s++) { checkCancel(o.cancel); await page.waitForTimeout(5000) }
  }
}
