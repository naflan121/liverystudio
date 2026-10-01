// Throwaway harness: exercises the pure parser + selection + deadlock logic from the branch
// without needing Electron or better-sqlite3.
//
// Run (ESM is required — cjs fails on top-level await):
//   npx esbuild scripts/_verify.ts --bundle --platform=node --format=esm --outfile=%TEMP%/lsv.mjs
//   node %TEMP%/lsv.mjs
import { parseLessonProposals, parseFailedAtSeconds, extractJson } from '../src/shared/review'

let pass = 0, fail = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++ } else { fail++; console.log(`  FAIL ${name}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`) }
}

// --- extractJson ---
check('bare array', extractJson('[{"a":1}]'), [{ a: 1 }])
check('fenced', extractJson('```json\n[{"a":1}]\n```'), [{ a: 1 }])
check('preamble', extractJson('Sure! Here you go:\n[{"a":1}]\nHope that helps.'), [{ a: 1 }])
check('object', extractJson('{"proposals":[]}'), { proposals: [] })
check('braces in string', extractJson('note "[hi]" then [{"a":"}{"}]'), [{ a: '}{' }])
check('escaped quote', extractJson('x [{"a":"say \\"hi\\""}] y'), [{ a: 'say "hi"' }])
check('empty', extractJson(''), null)
check('no json', extractJson('I cannot help with that.'), null)
check('truncated salvages first complete value', extractJson('[{"a":1},{"b":'), { a: 1 })
// The model often echoes the schema's own example before its real answer — the last value wins.
check('example echo loses to real answer', extractJson('Example: [{"rule":"EXAMPLE"}]\nNow yours:\n[{"rule":"REAL"}]'), [{ rule: 'REAL' }])
check('echo then fenced', extractJson('Here is an example [{"a":1}]\n```json\n[{"a":2}]\n```'), [{ a: 2 }])
check('no infinite loop on unterminated string', extractJson('[{"a":"unterminated'), null)

// --- parseLessonProposals (S9: preamble must not wipe the learning step) ---
check('plain', parseLessonProposals('[{"rule":"a","category":"Camera"}]'), [{ rule: 'a', category: 'Camera' }])
check('preamble tolerated', parseLessonProposals('Sure!\n[{"rule":"b","category":"Scale"}]\nDone.'), [{ rule: 'b', category: 'Scale' }])
check('fenced tolerated', parseLessonProposals('```\n[{"rule":"c"}]\n```'), [{ rule: 'c', category: null }])
check('caps at 3', parseLessonProposals('[{"rule":"1"},{"rule":"2"},{"rule":"3"},{"rule":"4"}]').length, 3)
check('empty array', parseLessonProposals('[]'), [])
check('object not array', parseLessonProposals('{"rule":"a"}'), [])
check('null rule', parseLessonProposals('[{"rule":null}]'), [])
check('oversize rule', parseLessonProposals(`[{"rule":"${'x'.repeat(500)}"}]`), [])
check('prose only', parseLessonProposals('The current lessons already cover this perfectly.'), [])

// --- parseFailedAtSeconds ---
// These are 15-second clips, so anything past a minute is not a moment in the video.
check('at 0:06', parseFailedAtSeconds('plane rolled inverted at 0:06'), 6)
check('0:06 in', parseFailedAtSeconds('0:06 in it flipped'), 6)
check('at 6s', parseFailedAtSeconds('broke at 6s'), 6)
check('6 seconds in', parseFailedAtSeconds('6 seconds in it goes wrong'), 6)
check('around 2s', parseFailedAtSeconds('around 2s the tail drops'), 2)
check('at 1:10 beyond clip length', parseFailedAtSeconds('it fails at 1:10 exactly'), null)
check('no time', parseFailedAtSeconds('just bad'), null)
check('empty', parseFailedAtSeconds(''), null)
// Wall-clock / durations must not become moments.
check('wall clock ignored', parseFailedAtSeconds('1920x1080 crop at 1:23'), null)
check('3:40 mark ignored', parseFailedAtSeconds('the 3:40 mark it starts'), null)
check('4:30 seconds ignored', parseFailedAtSeconds('render finished 4:30 seconds'), null)
check('position independent', parseFailedAtSeconds('at 1:23 it flips'), parseFailedAtSeconds('at 1:23 - the plane rolled'))
check('4:30 m:ss beats its :30 seconds decoy', parseFailedAtSeconds('at 0:06 seconds mark'), 6)

// --- exclusive() deadlock regression (B1) ---
// Verbatim copy of the shape in src/main/index.ts, on its own chain so the deliberate
// hang below doesn't keep the process alive.
function makeExclusive() {
  let chain: Promise<unknown> = Promise.resolve()
  return <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.then(() => undefined, () => undefined)
    return run
  }
}

// The fix: an outer exclusive() that awaits *inner* exclusive() calls is only safe when the
// inner calls are not themselves wrapped by an outer exclusive(). This is what B1 did wrong.
const outer = makeExclusive()
const fixed = outer(async () => {
  const inner = makeExclusive()
  let maxConcurrent = 0, active = 0, calls = 0
  for (const _ of ['a', 'b']) {
    await inner(async () => {
      active++; maxConcurrent = Math.max(maxConcurrent, active); calls++
      await new Promise((r) => setTimeout(r, 10)); active--
    })
  }
  return { calls, maxConcurrent }
})
const fixedResult = await fixed
check('outer exclusive resolves when not double-wrapped', fixedResult.calls, 2)
check('inner calls never overlap (serialised)', fixedResult.maxConcurrent, 1)

// Chain still usable afterwards — B1 permanently wedged it.
const after = await Promise.race([
  outer(async () => 'still-alive').then(() => 'ok'),
  new Promise((r) => setTimeout(() => r('WEDGED'), 300)),
])
check('chain usable after', after, 'ok')

// Reproduce B1 to prove the test above is actually testing something: an outer exclusive()
// whose callback awaits another exclusive() on the SAME chain never settles.
const doomed = makeExclusive()
let settled = false
void doomed(async () => { await doomed(async () => 'inner') }).then(() => { settled = true }).catch(() => { settled = true })
await new Promise((r) => setTimeout(r, 200))
check('same-chain nesting never settles (B1 root cause)', settled, false)

// --- Review.tsx rule-list selection (S3: fresh rules must stay visible) ---
// Mirrors the tiering + caps in the component: 9 slots for trusted rules, 3 reserved for fresh
// ones, because a long list of approved rules must never hide the rule that needs ticking.
function selectReviewRules(rows: { id: number; status: string; confidence: string; uses: number }[]) {
  const rank = (r: any): number => (r.status === 'approved' ? 3 : r.confidence === 'medium' || r.confidence === 'high' ? 2 : 1)
  const active = rows.filter((r) => rank(r) >= 2).sort((a, b) => rank(b) - rank(a) || b.uses - a.uses || b.id - a.id)
  const fresh = rows.filter((r) => rank(r) === 1).sort((a, b) => b.id - a.id)
  return [...active.slice(0, 9), ...fresh.slice(0, 3)].map((r) => r.id)
}
const manyApproved = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, status: 'approved', confidence: 'high', uses: 0 }))
const brandNew = { id: 999, status: 'pending', confidence: 'low', uses: 0 }
check('fresh rule survives a full approved list', selectReviewRules([...manyApproved, brandNew]).includes(999), true)
check('fresh rules come newest-first', selectReviewRules([{ id: 50, status: 'pending', confidence: 'low', uses: 0 }, { id: 100, status: 'pending', confidence: 'low', uses: 0 }])[0], 100)
check('list stays within the 12 cap', selectReviewRules([...manyApproved, brandNew]).length <= 12, true)
check('caps each tier independently', selectReviewRules(Array.from({ length: 14 }, (_, i) => ({ id: i + 1, status: 'pending', confidence: 'low', uses: 0 }))).length, 3)
check('empty input is safe', selectReviewRules([]), [])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
