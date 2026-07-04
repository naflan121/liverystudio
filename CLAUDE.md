# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Livery Lab** — a self-learning Electron desktop app that generates
**Seedance 2.0 image-to-video prompts** for RC scale-model aircraft videos,
optimised for social-media reach. The core illusion the prompts chase: RC models
filmed so they look like genuine full-size aviation ("is this real?").

The app does **not** call an LLM API. It shells out to the user's locally
installed **Claude Code CLI** (`claude -p …`) and reuses their OAuth login — no
API key. See `src/main/claude.ts`.

## Architecture

Electron + React + TypeScript, built with `electron-vite`. Three process zones:

```
src/
  main/        Electron main process
    index.ts     window lifecycle + all IPC handlers + the generate/learn orchestration
    claude.ts    spawns the Claude CLI headlessly, parses --output-format json
    store.ts     JSON file persistence (config, history, playbook, learning log, trends)
  preload/
    index.ts     contextBridge — the typed `window.api` surface (the ONLY main↔renderer bridge)
  shared/        imported by BOTH main and renderer — keep it dependency-free
    domain.ts    lever option lists (AIRCRAFT, CAMERA, CROWD, ENV, REGION, SCENARIOS, REACH, ILLUSION_TAGS)
    prompts.ts   ALL prompt templates + message builders (the product's real IP)
    types.ts     shared TypeScript interfaces
    util.ts      cleanTitle, toFilename, clampPlaybook
  renderer/src/
    App.tsx      the lab UI (levers, generate, queue, scoring) — large single component
    Settings.tsx settings page
    ui.ts        style tokens
```

Data flow for a generation: `App.tsx` builds a `GenerateRequest` → `window.api.generate`
→ IPC `generate` handler in `main/index.ts` → `buildUserMessage()` (prompts.ts)
composes the user message from the request + playbook + coverage-avoid lists +
trends → `callClaude()` runs the CLI → result returned to the renderer and pushed
onto the queue as an `Entry`.

## The prompt system (the heart of the product)

`shared/prompts.ts` holds several system prompts and builders:

- `SYSTEM` — the fixed production rules for every video prompt (output format,
  scale-illusion rules, aerodynamic realism, mandatory Negative terms). Rarely change.
- `buildUserMessage(req, playbook, extraNegatives, avoidAircraft, avoidEnvs, trends)`
  — turns the UI levers into instructions. **This is where new levers get wired.**
- `LEARN_SYSTEM` + `buildLearnMessage` / `buildRedistillMessage` — the self-learning
  loop: after a clip is scored, the model diagnoses why it did well/badly and
  rewrites a compact "playbook" of learned tactics (stored in `playbook.md`).
- `TITLE_SYSTEM`, `EXTRACT_SYSTEM` (scene/aircraft extraction), `TREND_SYSTEM`
  (web-search trend digest).

### How the aircraft/airline is chosen — important
The engine has **NO list of airlines**. `domain.ts` only has broad *categories*
(`auto`, `placeholder`, `commercial`, `military`, `vintage`, `surprise`). The
specific airline/aircraft is chosen **by the AI model itself** from a text
instruction. Bias toward repeat carriers (e.g. ANA) is inherent LLM behavior;
it's countered with soft nudges ("range widely", per-scenario avoid lists, the
playbook) and one hard lever: **Operator region** (`REGION` in domain.ts) —
`tier1` restricts the operator to US/Canada/UK/Australia/NZ (`TIER1_COUNTRIES`
in prompts.ts), `europe` to European carriers (`EUROPE_EXAMPLES`).

### Reach Boost (this branch — experimental, discardable)
The `reach-boost` branch adds an opt-in **Reach Boost** toggle driven by
`docs/rc_performance_analysis.md`: when `req.boost` is on, `buildUserMessage`
appends one ceiling-attempt bias block (tarmac, widebody, centerline/rotation
composition). Off = byte-identical to `main`. Entries record `boost` (and an
optional `views` count captured at scoring) so Settings' win-rate card A/Bs
boost-on vs boost-off. Two report-driven scenarios were added: `centerline`
and `distant_reveal` (the latter triggers the SYSTEM "reveal exception" that
legitimately hides scale cues). If the A/B disappoints, discard this branch.

## Adding a new lever (the common task)

A lever flows through four files — keep them in sync:
1. `shared/types.ts` — add the field to `GenerateRequest` (and `Entry` if it should
   persist to history / feed the learner).
2. `shared/prompts.ts` — read `req.<field>` in `buildUserMessage` and push an
   instruction. Order matters: later `parts.push` lines override earlier ones; the
   user `nudge` is intentionally last (highest priority).
3. `renderer/src/App.tsx` — add `useState`, include it in the `req` object (~line 207)
   and the `mk()` entry factory (~line 210), and add the checkbox/control UI (~line 393+).
4. Main process (`main/index.ts`) passes `req` straight through — usually no change
   needed unless the lever affects coverage/avoid logic.

## Persistence

`store.ts` writes JSON files to a configurable **data folder** (default: Electron
`userData`; can be pointed at a shared Google Drive folder for multi-device sync).
Files: `config.json`, `history.json` (capped 500 entries), `playbook.md`,
`learning-log.jsonl`, `trends.json`. Writes are atomic (temp + rename) with `.bak`
backups because Drive sync can corrupt mid-write. A per-device `location.json` in
`userData` points at the chosen data folder.

## Build & run

```sh
npm run dev          # dev with hot-reload
npm run build        # electron-vite build
npm run package:win  # portable Windows folder in .\release\
npx tsc --noEmit     # type-check (tsconfig has strict:false, noEmit)
```

There is **no test suite** and no linter script wired. Verify changes with
`npx tsc --noEmit`.

## Conventions & gotchas

- **Prose, not bullets, inside generated prompts.** The `SYSTEM` prompt enforces a
  strict 3-section output (`Visual:` / `Audio:` / `Negative:`) under 1500 chars.
- **`shared/` must stay importable by the renderer** — no Node/Electron imports there.
- CLI calls are **serialised** via `exclusive()` in main so generation and learning
  never overlap.
- The mechanical aircraft-ID extraction always runs on a fast model
  (`FAST_MODEL = claude-haiku-4-5`); generation and learning models are configurable
  (defaults: generation `claude-sonnet-4-6`, learning `claude-opus-4-8`).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Repo location note

This git repo lives at `C:\xampp\htdocs\prompt-engine` (also the Google Drive
source-of-record). Per `README.md`, the intended **dev/build working copy** is a
local, non-Drive folder (`C:\Users\User\LiveryLab`) because `node_modules` cannot
live on Drive. If `npm install`/`npm run dev` behave oddly here, that's why —
confirm with the user which copy they're running.
