import { spawn, execFileSync } from 'node:child_process'
import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export interface ClaudeOptions {
  cliPath?: string
  model: string
  system: string
  timeoutMs: number
  /** Short tag for log lines, e.g. 'prompt' | 'rewrite' | 'title' | 'learn'. */
  label?: string
  /** Optional progress sink — receives lifecycle events for this CLI call. */
  onLog?: (level: 'info' | 'ok' | 'warn' | 'err', msg: string) => void
  /** Tools to whitelist for this call, e.g. ['WebSearch','WebFetch']. Enables web access headlessly with no permission prompt. */
  allowedTools?: string[]
}

/**
 * Extract the CLI's JSON result envelope from stdout. The CLI (or an MCP
 * server it loads) can print stray diagnostic lines to stdout alongside the
 * envelope, which breaks a whole-output JSON.parse — so fall back to scanning
 * line by line for the object that carries the result.
 */
function parseEnvelope(out: string): any | null {
  const trimmed = out.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* stdout is not pure JSON — scan for the envelope line */
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.trim()
    if (!s.startsWith('{')) continue
    try {
      const j = JSON.parse(s)
      if (j && typeof j === 'object' && ('result' in j || j.type === 'result')) return j
    } catch {
      /* not this line */
    }
  }
  return null
}

/** Resolve an absolute path to the claude CLI, or null if not found. */
export function detectCli(override?: string): string | null {
  if (override && override.trim() && existsSync(override.trim())) return override.trim()

  const home = os.homedir()
  const guesses = [
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
  ]
  for (const g of guesses) if (existsSync(g)) return g

  // Fall back to PATH lookup via `where` (Windows) / `which` (POSIX).
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which'
    const out = execFileSync(finder, ['claude'], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    if (out.length && existsSync(out[0])) return out[0]
  } catch {
    /* not on PATH */
  }
  return null
}

/**
 * Call the installed Claude Code CLI headlessly and return the text result.
 * Uses the user's existing OAuth login — no API key required.
 */
export function callClaude(userContent: string, opts: ClaudeOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const tag = opts.label ? `[${opts.label}] ` : ''
    const log = opts.onLog || (() => {})

    const bin = detectCli(opts.cliPath)
    if (!bin) {
      log('err', `${tag}Claude CLI not found — set its path in Settings.`)
      reject(new Error('Claude CLI not found. Set its path in Settings.'))
      return
    }

    // Both the user prompt and the (playbook-inflated, scenario-block-inflated)
    // system prompt can run to tens of thousands of characters. Passing them as
    // argv strings hits Windows' ~32K CreateProcess command-line ceiling and
    // spawn fails with ENAMETOOLONG — so the user prompt goes over stdin and the
    // system prompt goes through a temp file instead of argv.
    const sysFile = path.join(os.tmpdir(), `livery-studio-system-${crypto.randomUUID()}.txt`)
    writeFileSync(sysFile, opts.system, 'utf8')

    const args = [
      '-p',
      '--system-prompt-file', sysFile,
      '--model', opts.model,
      '--output-format', 'json',
    ]
    // Whitelist web tools when requested — runs headlessly with no permission prompt.
    if (opts.allowedTools && opts.allowedTools.length) {
      args.push('--allowedTools', ...opts.allowedTools)
    }

    log('info', `${tag}Launching CLI · model ${opts.model} · prompt ${userContent.length} chars`)
    const started = Date.now()

    const cleanup = () => { try { unlinkSync(sysFile) } catch { /* best effort */ } }

    // Run from a neutral temp dir so the CLI does not auto-discover any
    // project CLAUDE.md and inject unrelated context.
    const child = spawn(bin, args, {
      cwd: os.tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdin.on('error', () => { /* e.g. EPIPE if the CLI exits before reading stdin */ })
    child.stdin.end(userContent, 'utf8')

    let out = ''
    let err = ''
    let streaming = false
    const timer = setTimeout(() => {
      log('err', `${tag}Timed out after ${Math.round(opts.timeoutMs / 1000)}s — killing CLI.`)
      child.kill()
      reject(new Error(`Timed out after ${Math.round(opts.timeoutMs / 1000)}s.`))
    }, opts.timeoutMs)

    log('info', `${tag}Waiting for the model…`)
    child.stdout.on('data', (d) => {
      if (!streaming) { streaming = true; log('info', `${tag}Response started — receiving…`) }
      out += d.toString()
    })
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) => { clearTimeout(timer); cleanup(); log('err', `${tag}${(e as Error).message}`); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
      const secs = ((Date.now() - started) / 1000).toFixed(1)
      if (code !== 0 && !out.trim()) {
        log('err', `${tag}CLI exited with code ${code} after ${secs}s.`)
        reject(new Error(err.trim() || `Claude CLI exited with code ${code}.`))
        return
      }
      const json = parseEnvelope(out)
      if (json) {
        if (json.is_error) {
          log('err', `${tag}Model returned an error after ${secs}s.`)
          reject(new Error(json.result || 'Claude returned an error.'))
          return
        }
        const result = String(json.result || '').trim()
        log('ok', `${tag}Received ${result.length} chars in ${secs}s.`)
        resolve(result)
      } else {
        // No envelope found anywhere in stdout — return raw text as a fallback.
        const result = out.trim()
        log('ok', `${tag}Received ${result.length} chars in ${secs}s (raw).`)
        resolve(result)
      }
    })
  })
}

/** Quick connectivity check for the Settings page. Uses the configured generation model so the test exercises the same model generation will. */
export async function testCli(cliPath?: string, model = 'claude-sonnet-5'): Promise<{ ok: boolean; path: string; message: string }> {
  const bin = detectCli(cliPath)
  if (!bin) return { ok: false, path: '', message: 'Claude CLI not found on this PC. Install Claude Code or set the path manually.' }
  try {
    const reply = await callClaude('Reply with exactly: OK', {
      cliPath: bin,
      model,
      system: 'You are a connectivity test. Output only what is asked.',
      timeoutMs: 60000,
    })
    if (/OK/i.test(reply)) return { ok: true, path: bin, message: 'Connected — the CLI is installed and authenticated.' }
    return { ok: true, path: bin, message: `Reached the CLI (unexpected reply: ${reply.slice(0, 60)}).` }
  } catch (e: any) {
    return { ok: false, path: bin, message: e?.message || 'The CLI was found but the call failed. Make sure you are logged in to Claude Code.' }
  }
}
