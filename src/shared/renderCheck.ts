// Livery Studio "Check" on a render: a cheap model reads Dola's last reply and says what
// it means, so undocumented Dola messages don't need hard-coding. Dependency-free.

export type DolaReplyKind = 'refused' | 'busy' | 'credits' | 'working' | 'finished' | 'error' | 'unclear'
export type DolaAdvice = 'wait' | 'rerender' | 'move' | 'cancel' | 'rewrite'

export interface RenderCheckResult {
  kind: DolaReplyKind
  /** One plain sentence: what Dola is saying. */
  summary: string
  advice: DolaAdvice
  /** Dola's reply text as read from the page (trimmed). */
  reply: string
  hasVideo: boolean
  instanceName: string
  sentAt?: string
  checkedAt: string
}

export const DOLA_CHECK_SYSTEM = `You read the latest reply in a Dola (ByteDance AI assistant) chat where a user asked it to generate a short video from a text prompt, and say what state the request is in. Dola's messages change often and are not documented, so judge by meaning, not exact wording.

Kinds:
- refused: Dola declines this request/content (policy, "can't generate the requested content", "try something else").
- busy: temporary overload or rate limit ("high demand", "try again later", server busy).
- credits: out of daily video credits / quota for this account.
- working: it is still generating or has acknowledged and is in progress.
- finished: it says the video is ready/delivered.
- error: a technical failure (network, generation failed, something went wrong) that is not a refusal.
- unclear: empty, unrelated, or cannot tell.

Advice (pick the single best next step):
- wait: still working and not unusually long.
- rerender: a one-off failure — send the same prompt again.
- move: this account is the problem (busy, out of credits, stuck) — send it on another account.
- rewrite: refused — the prompt itself must change before it can render.
- cancel: nothing useful will come of it.

Output EXACTLY three lines, nothing else:
KIND: <one kind>
ADVICE: <one advice>
SUMMARY: <one short plain sentence for the user, quoting Dola briefly if helpful>`

export function dolaCheckMsg(reply: string, minutesSinceSent: number | null): string {
  const age = minutesSinceSent == null ? 'unknown' : minutesSinceSent < 120 ? `${minutesSinceSent} minutes` : `${Math.round(minutesSinceSent / 60)} hours`
  return `The prompt was sent ${age} ago. A normal video takes about 10-15 minutes.\n\nDOLA'S LATEST REPLY:\n"""\n${reply.slice(0, 1500) || '(empty)'}\n"""`
}

const KINDS: DolaReplyKind[] = ['refused', 'busy', 'credits', 'working', 'finished', 'error', 'unclear']
const ADVICE: DolaAdvice[] = ['wait', 'rerender', 'move', 'cancel', 'rewrite']

export function parseDolaCheck(raw: string): { kind: DolaReplyKind; advice: DolaAdvice; summary: string } {
  const grab = (k: string): string => {
    const line = raw.split(/\r?\n/).find((l) => l.trim().toUpperCase().startsWith(k + ':'))
    return line ? line.slice(line.indexOf(':') + 1).trim() : ''
  }
  const kind = grab('KIND').toLowerCase() as DolaReplyKind
  const advice = grab('ADVICE').toLowerCase() as DolaAdvice
  return {
    kind: KINDS.includes(kind) ? kind : 'unclear',
    advice: ADVICE.includes(advice) ? advice : 'rerender',
    summary: grab('SUMMARY') || raw.trim().split(/\r?\n/)[0]?.slice(0, 200) || 'Could not read the check result.',
  }
}
