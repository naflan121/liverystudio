// Throwaway harness: exercises the pure parser + deadlock logic from the branch without
// needing Electron or better-sqlite3. Run with: npx esbuild scripts/_verify.ts --bundle --platform=node --format=cjs --outfile=$env:TEMP\lsv.js && node $env:TEMP\lsv.js
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

// --- parseFailedAtSeconds (N6: wall-clock must not be a video moment) ---
check('at 0:06', parseFailedAtSeconds('plane rolled inverted at 0:06'), 6)
check('0:06 in', parseFailedAtSeconds('0:06 in it flipped'), 6)
check('at 6s', parseFailedAtSeconds('broke at 6s'), 6)
check('6 seconds in', parseFailedAtSeconds('6 seconds in it goes wrong'), 6)
check('around 2s', parseFailedAtSeconds('around 2s the tail drops'), 2)
check('wall clock ignored', parseFailedAtSeconds('1920x1080 crop at 1:23'), null)
check('no time', parseFailedAtSeconds('just bad'), null)
check('empty', parseFailedAtSeconds(''), null)
check('clamped', parseFailedAtSeconds('at 600s'), 300)

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
