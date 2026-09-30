// MiniMax engine: runs one prompt through MiniMax Code (`mcode exec`) headlessly.
//
// Safety: mcode is a full agent (bash, file edit, the user's MCP servers incl. Dola)
// and by default auto-approves tools. Every Studio call therefore runs with
// MAVIS_LOCAL_RUNTIME_DISABLE_TOOLS=1 (verified: no tools execute, no file writes,
// no Dola calls), in an empty scratch folder, with a step limit and a timeout.
// The Studio only ever wants text back.

import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getConfig } from './store'
import { tokensToday } from './db'
import type { CallUsage } from './claude'

let usageSink: (u: CallUsage) => void = () => { /* wired by index.ts */ }
export function setMiniMaxUsageSink(fn: (u: CallUsage) => void): void { usageSink = fn }

function cliJs(): string | null {
  const configured = getConfig().ai.minimax.cliPath.trim()
  const guesses = [configured, path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@minimax-ai', 'code', 'cli.js')].filter(Boolean)
  return guesses.find((g) => fs.existsSync(g)) || null
}

/** A Node.js runtime for mcode: the system `node` if present, else Electron running as Node. */
function nodeRuntime(): { cmd: string; env: Record<string, string> } {
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s))
    if (found) return { cmd: found, env: {} }
  } catch { /* not on PATH */ }
  return { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
}

/** Models configured in mcode (~/.minimax/config.yaml), e.g. MiniMax-M3, MiniMax-M2.7-highspeed. */
export function listMiniMaxModels(): { id: string; video: boolean }[] {
  try {
    const yaml = fs.readFileSync(path.join(os.homedir(), '.minimax', 'config.yaml'), 'utf8')
    const out: { id: string; video: boolean }[] = []
    const lines = yaml.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const m = /^ {6}(MiniMax-[\w.-]+):\s*$/.exec(lines[i])
      if (!m) continue
      // Look ahead within this model block for an input modality of "video".
      let video = false
      for (let j = i + 1; j < lines.length && !/^ {6}\S/.test(lines[j]) && !/^ {0,4}\S/.test(lines[j]); j++) {
        if (/^\s+- video\s*$/.test(lines[j])) video = true
      }
      out.push({ id: m[1], video })
    }
    return out
  } catch { return [] }
}

export function miniMaxStatus(): { installed: boolean; cli: string | null; models: { id: string; video: boolean }[] } {
  const cli = cliJs()
  return { installed: !!cli, cli, models: listMiniMaxModels() }
}

export interface MiniMaxCall {
  model: string
  label: string
  timeoutMs: number
  /** Files the model should see (e.g. a rendered MP4). */
  files?: string[]
  maxSteps?: number
  onLog?: (level: 'info' | 'ok' | 'warn' | 'err', msg: string) => void
}

/** Run one prompt on MiniMax and return its text answer. */
export function callMiniMax(input: string, o: MiniMaxCall): Promise<string> {
  return new Promise((resolve, reject) => {
    const log = o.onLog || (() => {})
    const tag = `[${o.label} · MiniMax] `
    const cfg = getConfig().ai.minimax
    if (!cfg.enabled) { reject(new Error('MiniMax is switched off in Settings → AI & models.')); return }
    const limit = cfg.dailyTokenLimit
    if (limit > 0 && tokensToday('minimax') >= limit) { reject(new Error(`MiniMax daily token limit reached (${limit.toLocaleString()}). Raise it in Settings, or wait for tomorrow.`)); return }
    const cli = cliJs()
    if (!cli) { reject(new Error('MiniMax Code (mcode) not found. Install it, or set its cli.js path in Settings.')); return }

    // Empty scratch folder: even if a tool slipped through, there is nothing here to touch.
    const cwd = path.join(os.tmpdir(), 'livery-studio-minimax')
    fs.mkdirSync(cwd, { recursive: true })
    const secs = Math.max(30, Math.round(o.timeoutMs / 1000))
    const args = [cli, 'exec', '--input', '-', '--model', `minimax/${o.model}`, '--prompt-mode', 'work', '--output-format', 'json',
      '--permission', 'smart', '--max-steps', String(o.maxSteps ?? 2), '--timeout', `${secs}s`, '--cwd', cwd]
    for (const f of o.files || []) args.push('--file', f)

    const rt = nodeRuntime()
    const started = Date.now()
    log('info', `${tag}Launching · model ${o.model}${o.files?.length ? ` · ${o.files.length} file(s)` : ''}`)
    const child = spawn(rt.cmd, args, {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...rt.env, MAVIS_LOCAL_RUNTIME_DISABLE_TOOLS: '1' },
    })
    child.stdin.on('error', () => { /* EPIPE if it exits early */ })
    child.stdin.end(input, 'utf8')
    let out = '', err = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`MiniMax timed out after ${secs + 15}s.`)) }, (secs + 15) * 1000)
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', () => {
      clearTimeout(timer)
      const line = out.trim().split(/\r?\n/).reverse().find((l) => l.trim().startsWith('{'))
      let j: any = null
      try { j = line ? JSON.parse(line) : null } catch { /* handled below */ }
      const u = j?.usage || {}
      try {
        usageSink({
          provider: 'minimax', label: o.label, model: o.model, ok: j?.status === 'succeeded', costUsd: 0,
          inputTokens: Number(u.inputTokens || 0), outputTokens: Number(u.outputTokens || 0),
          cacheReadTokens: Number(u.cacheReadTokens || 0), cacheWriteTokens: Number(u.cacheWriteTokens || 0),
          durationMs: Number(j?.durationMs || Date.now() - started),
        })
      } catch { /* metering never breaks a call */ }
      if (!j) { log('err', `${tag}No result.`); reject(new Error((err.trim() || out.trim() || 'MiniMax returned nothing.').slice(0, 400))); return }
      if (j.status !== 'succeeded') { log('err', `${tag}${j.error?.message || j.status}`); reject(new Error(`MiniMax: ${j.error?.message || j.status}`)); return }
      const text = String(j.output ?? '').trim()
      log('ok', `${tag}Received ${text.length} chars in ${((Date.now() - started) / 1000).toFixed(1)}s.`)
      resolve(text)
    })
  })
}
