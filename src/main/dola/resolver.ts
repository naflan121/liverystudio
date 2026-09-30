// Watermark-free video resolver — ported from FangyueBrowser-Fork/mcp/dola-mcp/resolver.js
// (itself a port of DolaMultiBrowser/LocalVideoResolver.cs). Dola's chat data carries a
// `fallback_api` URL per generated video; requesting it with logo_type=unwatermarked
// returns a main_url token that decodes to the raw MP4.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36'
const QAAB_SALT = Buffer.from('4dd4c2e6b83162090e52b3c7a6733ba41cb2462b829ab58a196b39db57177524f49baf7f08e8d68d26a72e37c1a95a2f1f05a51892aef2949732b62a38aadd58', 'hex')
const isUrl = (s: string | undefined | null): boolean => /^https?:\/\//i.test(s ?? '')

// Undo one or more layers of JSON string escaping (chat payloads nest JSON inside JSON strings).
function unescapeJson(s: string): string {
  for (let i = 0; i < 4 && s.includes('\\'); i++)
    s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1')
  return s
}

/** All fallback_api URLs in a raw response body, in order of appearance. */
export function findFallbackApis(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(/fallback_api\\*"\s*:\s*\\*"(.*?)\\*"/g)) {
    const url = unescapeJson(m[1])
    if (isUrl(url) && !out.includes(url)) out.push(url)
  }
  return out
}

function decodeBase64Loose(text: string): Buffer | null {
  const t = text.trim()
  for (const v of new Set([t, t.replace(/\$/g, '_').replace(/@/g, '/').replace(/#/g, '.'), t.replace(/\$/g, '+').replace(/@/g, '/').replace(/#/g, '=')])) {
    const s = v.replace(/-/g, '+').replace(/_/g, '/')
    const padded = s.padEnd(s.length + (4 - s.length % 4) % 4, '=')
    if (v && /^[A-Za-z0-9+/]*={0,2}$/.test(padded)) return Buffer.from(padded, 'base64')
  }
  return null
}

function bytesToAsciiUrl(buf: Buffer | null): string {
  if (!buf?.length || buf.some((v) => v !== 9 && v !== 10 && v !== 13 && (v < 32 || v > 126))) return ''
  const s = buf.toString('ascii')
  return isUrl(s) ? s : ''
}

function tryDecryptAesCbc(payload: Buffer, key: Buffer, iv: Buffer): Buffer | null {
  try {
    const d = crypto.createDecipheriv('aes-128-cbc', key, iv)
    d.setAutoPadding(false)
    return Buffer.concat([d.update(payload), d.final()])
  } catch { return null }
}

function stripPkcs7(b: Buffer): Buffer | null {
  const n = b[b.length - 1]
  if (!n || n > 16 || n > b.length) return null
  for (let i = b.length - n; i < b.length; i++) if (b[i] !== n) return null
  return b.subarray(0, b.length - n)
}

function decodeQaabToken(token: string, keySeed: string): string {
  const a = decodeBase64Loose(token), seed = decodeBase64Loose(keySeed)
  if (!a || !seed) return ''
  const inner = crypto.createHash('sha512').update(seed.subarray(0, 32)).digest()
  const h = crypto.createHash('sha512').update(Buffer.concat([inner, QAAB_SALT])).digest()
  const k = h.subarray(0, 16), iv = h.subarray(16, 32)
  const candidates: [Buffer, Buffer, Buffer][] = []
  if (a.length >= 4 && a[0] === 168 && a[1] === 0 && a[2] === 1 && a[3] === 0) {
    candidates.push([a.subarray(4), k, iv], [a.subarray(4), iv, k])
    if (a.length > 36) candidates.push([a.subarray(36), k, a.subarray(20, 36)], [a.subarray(36), k, iv])
  } else candidates.push([a, k, iv])
  for (const [payload, key, i] of candidates) {
    if (!payload.length || payload.length % 16) continue
    const plain = tryDecryptAesCbc(payload, key, i)
    if (!plain) continue
    const url = bytesToAsciiUrl(plain) || bytesToAsciiUrl(stripPkcs7(plain))
    if (url) return url
  }
  return ''
}

function decodeMainUrl(token: string, keySeed: string): string {
  if (isUrl(token)) return token
  const b = decodeBase64Loose(token)
  if (b && isUrl(b.toString('utf8'))) return b.toString('utf8')
  return token.startsWith('qAAB') && keySeed ? decodeQaabToken(token, keySeed) : ''
}

function findKeySeed(v: unknown, depth = 0): string {
  if (depth > 10 || v == null) return ''
  if (typeof v === 'string') {
    const m = v.match(/(?:^|[?&])key_seed=([^&"'<>\\\s]+)/i) ?? v.match(/["']key_seed["']\s*:\s*["']([^"']+)/i)
    return m ? decodeURIComponent(m[1]) : ''
  }
  if (typeof v !== 'object') return ''
  const o = v as Record<string, unknown>
  if (typeof o.key_seed === 'string' && o.key_seed.trim()) return o.key_seed.trim()
  for (const c of Object.values(o)) { const s = findKeySeed(c, depth + 1); if (s) return s }
  return ''
}

export interface ResolvedVideo { url: string; width: number; height: number; definition: string; size: number }

/** fallback_api -> the best-quality unwatermarked stream. */
export async function resolveFallbackApi(fallbackApi: string): Promise<ResolvedVideo> {
  const u = new URL(fallbackApi)
  u.searchParams.set('channel', 'no')
  u.searchParams.set('codec_type', '8')
  u.searchParams.set('logo_type', 'unwatermarked')
  const res = await fetch(u, { headers: { accept: 'application/json,text/plain,*/*', 'user-agent': UA } })
  if (!res.ok) throw new Error(`fallback_api -> HTTP ${res.status}`)
  const json: any = await res.json()

  let data = json.video_info ?? json.data?.video_info ?? json
  data = data.data ?? data
  const list: any[] = data.video_list && typeof data.video_list === 'object' ? Object.values(data.video_list) : []
  let best: any = null, bestScore = -Infinity
  for (const e of list.length ? list : [data]) {
    if (!(e.main_url ?? e.play_url)) continue
    const score = Number(e.bitrate ?? e.real_bitrate ?? 0) + Number(e.vwidth ?? e.width ?? 0) * Number(e.vheight ?? e.height ?? 0)
    if (!best || score > bestScore) { best = e; bestScore = score }
  }
  if (!best) throw new Error('fallback_api response has no main_url')
  const url = decodeMainUrl(String(best.main_url ?? best.play_url).trim(), findKeySeed(json))
  if (!url) throw new Error('main_url decoding failed')
  return {
    url,
    width: Number(best.vwidth ?? best.width ?? 0),
    height: Number(best.vheight ?? best.height ?? 0),
    definition: best.definition ?? '',
    size: Number(best.size ?? 0),
  }
}

/** Streams url to filePath via a .part file; verifies the byte count when the server reports one. */
export async function downloadFile(url: string, filePath: string): Promise<number> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok || !res.body) throw new Error(`video download -> HTTP ${res.status}`)
  const expected = Number(res.headers.get('content-length') ?? 0)
  const part = filePath + '.part'
  const out = fs.createWriteStream(part)
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>)
      if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()))
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())))
  } catch (e) {
    out.destroy()
    fs.rmSync(part, { force: true })
    throw e
  }
  const bytes = fs.statSync(part).size
  if (expected && bytes !== expected) {
    fs.rmSync(part, { force: true })
    throw new Error(`video download incomplete: ${bytes} of ${expected} bytes`)
  }
  fs.renameSync(part, filePath)
  return bytes
}
