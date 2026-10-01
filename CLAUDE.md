# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Livery Studio (this repo) vs Livery Lab

**Livery Studio** is a fork of Livery Lab (`C:\xampp\htdocs\prompt-engine`,
cloned 2026-09-30 from its `feedback-brain` branch; git remote `lab`, push
disabled). The Lab keeps running untouched; the Studio extends it into one tool
for the whole pipeline. **The brain is the brain**: `shared/prompts.ts`,
`shared/brain.ts`, the playbook/learn loop and the `Entry` shape stay as in the
Lab, so brain fixes can be cherry-picked across (`git fetch lab`).

Pipeline roadmap:

1. **Render** (done): prompt -> Dola (Seedance 2.5) via DolaMultiBrowser ->
   watermark-free MP4. `main/dola/*` is a TS port of
   `C:\Users\User\Documents\FangyueBrowser-Fork\mcp\dola-mcp` (keep selectors in
   step with it). `main/render.ts` = persistent queue (`renders.json`, main-owned),
   daily cap, parallelism, busy cooldown, resume-after-restart via the saved chat URL.
   UI: `renderer/src/Renders.tsx` (+ `RenderStrip` on the lab result), Settings → Render.
2. **Review** (done, except 2c): `renderer/src/Review.tsx` + `main/review.ts`.
   Verdict lives on the RenderJob (`job.review`) and in the append-only `reviews`
   table; files move to `approved\` / `rejected\` beside where they were rendered.
   Rejections -> `render-lessons.md` (one Claude call, `RENDER_LESSONS_SYSTEM` in
   `shared/review.ts`), appended to generation via `withRenderLessons()` in index.ts —
   never edit prompts.ts for Studio features. Every-take-rejected rule: ask /
   rerender / rewrite (`Entry.fixOf` chains rewrites; retries counted per chain).
   **2c (not built):** AI pre-check — ffmpeg frames -> Claude flags issues, pre-fills
   reasons, sorts the queue.
3. **Plan**: port AeroPost Pro's slot scoring (`C:\xampp\htdocs\aviation-posting-pro\js\core.js`)
   and have the AI build a posting timetable + per-platform captions for approved clips.
   Posting stays manual (Facebook Page + YouTube).
4. **Publish/measure**: YouTube Data API + Facebook Graph API (Page) scheduled
   uploads and automatic view pulls into scoring.

Data: the Studio has its own userData (`%APPDATA%\Livery Studio`). On first run
`importFromLiveryLab()` (store.ts) **copies** the Lab's brain documents and merges
the Lab's history into the DB; the Lab's files are never written. `setDataDir`
refuses the Lab's folder.

**Storage (`main/db.ts`, better-sqlite3, WAL).** Growing, relational data lives in
SQLite at `%APPDATA%\Livery Studio\studio.db` — tables `entries` (prompt history,
uncapped) and `render_jobs`, each row = full JSON in `data` + indexed columns.
Schema changes go in `MIGRATIONS` (append only; `user_version` tracks them). Small
hand-editable docs stay as files in the data folder (config, playbook, versions,
learning log, trends, concepts). The DB never lives in a synced folder; dated
snapshots go to `<data folder>/backups/` (7 kept). The old `history.json` /
`renders.json` were imported once (union with their `.bak`) and are no longer read.
`getHistory()` still returns `Entry[]`, so the brain is unchanged; the renderer's
`persist` sends only changed entries and `setHistory` upserts, never deletes.
Phase 2+ state (reviews, schedules, posts, metrics) = new tables keyed by entry id.

Native module: after `npm install`, `postinstall` runs `electron-rebuild` for
better-sqlite3. If the app fails with a NODE_MODULE_VERSION error, run
`npx electron-rebuild -f -w better-sqlite3`.

**Renderer layout (UI stage 1–3).** `Shell.tsx` = sidebar (Today / Create / Renders /
Review / Library / Brain / Settings), status bar, activity drawer, theme switch.
Colours are CSS tokens in `theme.css` (dark default, light, follow-Windows); never
hard-code a hex in a screen — use `ui.ts` tokens. Screens: `Today.tsx`,
`lab/Lab.tsx` (+ `lab/useLab.ts`: lab state lives in a hook called by App so it
survives screen switches), `Renders.tsx`, `Review.tsx`, `Library.tsx`,
`Settings.tsx` (mode "settings" | "brain" — Brain reuses it for the knowledge cards,
plus `brain/BrainCards.tsx`: usage meter + review record).

**Usage meter / notifications / Dola guard.** `claude.ts` reports each call's
CLI-reported cost + tokens to the `usage` table (v3). `notify.ts` shows Windows
toasts per Settings → Notifications. `render.ts` pauses new sends after
`render.pauseAfterFailures` page failures in a row (state in meta `queue_paused`).

**MiniMax (second engine, `main/minimax.ts`).** Runs MiniMax Code (`mcode exec`, npm
global `@minimax-ai/code/cli.js`) on the user's MiniMax plan. mcode is a full agent that
auto-approves tools and loads the user's MCP servers (incl. Dola) — ALWAYS run it with
`MAVIS_LOCAL_RUNTIME_DISABLE_TOOLS=1` (verified: no tool/Dola/file execution), an empty
scratch cwd, `--max-steps` and `--timeout`. No system-prompt flag: instructions go at the
top of the input. `--output-schema` fails on M3 (STRUCTURED_OUTPUT_INVALID) — ask for JSON
in the prompt and parse it (`precheck.ts` parsePrecheck). Settings → AI & models:
`ai.routes` picks Claude or MiniMax per task (titles, captions, scene, reference naming —
`runRoute()` in index.ts). Generation + learning models (Settings → AI & models) can also be
a MiniMax model: stored as `'minimax:<id>'` in `generationModel` / `learningModel`, and every call
that used them goes through `callModel()` in index.ts (prompt, rewrite, candidates, concept, learn,
redistill, review fix-prompt/render lessons, and `claude:generation` routes). Trend research and the
CLI test stay on Claude (`claudeOnly()`, web tools). MiniMax options show only when mcode is found,
greyed out until MiniMax is switched on.
`ai.precheck`: a MiniMax video model (M3) watches each finished render and stores an
advisory verdict on `job.precheck`; reviews record it (`reviews.precheck`) for the
agreement stat. Usage rows carry `provider`; `ai.minimax.dailyTokenLimit` caps MiniMax.
MiniMax is NOT used for video generation (user decision).

**Variety + Concept brainstorm (Studio-side, prompts.ts untouched).** `shared/variety.ts`
reads setting · camera · light from each prompt's Visual section with keyword rules (no AI
call) and `withVariety()` in index.ts appends a short "VARIETY CHECK" to generate /
candidates: what this lineup already used (`req.batchUsed`, filled by `runLineup`), the
last 6 clips, and anything overused in the last 20 (4+ and 40%+). Context only — the model
still chooses; levers are never dealt out (user decision). Skipped for ramp_glide /
cliff_drop. `shared/brainstorm.ts` + IPC `concept:brainstorm`: N ranked concepts in ONE
call on the learning model; proven formats are passed as real numbers (3+ scored clips)
and an idea may only borrow from one the data backs (`BORROWS:` line). UI: "🧠 Brainstorm
concepts" (lab/Ideas.tsx) and the lineup Mix "Fresh concepts" (one brainstorm per lineup).

**Renders → Check (`render:check` / `render:act`).** Any job that reached Dola (has
`chatUrl`) gets a 🔎 Check button, whatever its age. `readJobReply()` (render.ts) reads the
chat's last reply via `readLastReply()` (driver.ts, hard 15 s timeout) — without navigating
if a job is running on that instance, refusing if another job holds it. The text goes to the
`ai.routes.dolaCheck` engine (default Haiku) with `DOLA_CHECK_SYSTEM` (shared/renderCheck.ts):
kind (refused/busy/credits/working/finished/error/unclear) + advice + summary — no hard-coded
Dola wording. Actions: `actOnJob()` re-render / move (adds the instance to `tried`) / cancel,
optionally cooling the instance down (`setCooldown`, persisted in meta `dola_cooldown`). A
running job is interrupted via `pendingAction` + cancel flag; if its page is frozen it's
released by force after 60 s. Each run carries a token (`runTokens`); `own()` in runJob stops
a released run from touching the job or freeing the instance.

**Accounts screen (Dola instance manager, `Instances.tsx`).** Per-account usage lives in meta
`dola_usage` (render.ts: `recordSend` when a prompt goes out, `recordResult` on done/failed,
per local day `dayKey()`, 14 days kept; seeded once from past jobs). `pickInstance` with
`render.pickStrategy` 'balanced' (default) sorts free accounts by renders today, then least
recently used, then already-running; 'first' = old behaviour. `render.perAccountDailyCap`
(0 = off) skips an account for the rest of the day. Busy / reserved / cooling-down /
out-of-credit accounts are always skipped. The screen shows state, today/all-time, ok rate,
last used, current render, and Start / Show / End cooldown / End credit rest / Reserve / reset.
No anti-detection work on Dola (user's clients' own accounts, used within their daily credits).

**Dola logouts + warm-up (`driver.ts` loginState / warmUp, `render.ts` "Dola logouts").** Dola signs accounts
out by itself now and then. Logged out = a visible "Log In" button — never judge by the URL (it keeps
`?from_logout=1` after logging back in). `assertLoggedIn()` runs before typing, after the warm-up, right
before send, and on every `waitForVideo` poll; it throws `LoggedOutError`, and `onLoggedOut()` marks the
account (meta `dola_logged_out`), records how many renders it had sent (`InstanceUsage.logoutsAfter`, last 10)
and moves the job to another account without counting a try (a job already sent on that account is sent
again elsewhere; its old chat URL goes in the note). Logged-out accounts are skipped until `checkLogins()`
(Accounts → Check login / Check all logins, or the `render.loginCheckMinutes` timer) sees them logged in,
which also resets `sinceLogin`. `render.perLoginCap` (0 = off) rests an account after N renders since its
last login (↺ on the row resets the count). Warm-up (`render.warmup`, default on, `render.warmupMessage`
default "Hi"): new chat → greeting → wait for the reply → the video prompt in that same chat. Notification
kind `loggedOut`. The same checks + warm-up live in dola-mcp (`dola_check_login`, `dola_warmup`).
Not built: switching an account's proxy when Dola logs it out — that would work around Dola's own
enforcement (see the no-anti-detection rule above). Logged-out accounts wait for the user to log in again.

## What the brain is (inherited from Livery Lab)

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

### Ramp Glide & Splash (branch `ramp-glide` — experimental, discardable)
Adds the proven-viral `ramp_glide` scenario, distilled from the concept study in
`G:\My Drive\Sholacase\Video Generation\Scale model\New viral concepts\`
(`ramp-glide-splash-v3.md` / `-v4.md`): lakeside-festival ramp launch → long
dead-stick glide → belly splash, filmed by drone. Its craft block in
`prompts.ts` uses the **v3 staging as the default** — swing in behind at
launch, chase from behind and slightly above, tail toward the lens — because
field results (incl. a ~1.5M-view clip) beat v4's theory that the chase was
un-generatable. v4's diagnosis survives as ARMOR: explicit orientation-lock
wording, anti-flip Negatives, the soft single-shadow rule, and two flip-proof
alternate geometries (head-on, side-profile) for variety. A straight-down
overhead is a known failure of aerial framings — negatives guard against it.
Commit to ONE geometry per clip; Negatives must match the chosen geometry
(never negate the geometry you chose). Announcer commentary is mandatory (AI invents a fresh
short quiet-then-LOUD line each run, ideally riffing on the chosen
aircraft/airline) and slow motion is hard-banned (festival energy). There is
also a general **Long prompt** lever (`req.longPrompt`, `LONG_PROMPT_CHARS` =
4800) for platforms that accept long prompts — works on every scenario,
tracked on entries for the learner. New `Scenario` fields: `weight` (weighted Random
pick — ramp_glide is 3; helper `pickRandomScenario()` in domain.ts) and
`charBudget` (per-scenario lift of the 1500-char limit — ramp_glide is 3800,
enforced in `main/index.ts`). The scenario locks scene/camera/env/crowd
(`sceneLocked` in `buildUserMessage`), skips the Reach Boost block (entries
record the *effective* boost so the A/B stays clean), and tells the model to
invent a fresh short announcer line each run — optionally playing on the chosen
airline/aircraft. SYSTEM gained unpowered/dead-stick exceptions (no motor
audio; crew hands replace the FPV-pilot scale cue).

### Feedback Brain (branch `feedback-brain`)
`shared/brain.ts` computes real stats straight from `history.json` — win rates
per lever value and per scenario×camera combo, and a GLOBAL (all-scenario)
aircraft/operator overuse check. This grounds two things that used to run on
LLM narrative alone: `buildRedistillMessage` now prepends a computed
"STATISTICAL EVIDENCE" block instead of trusting the model to spot patterns in
a raw list, and `main/index.ts`'s avoid-lists now also block an operator
overused *across* scenarios (the old `recentCombos`/`recentAnyCombos` were
each scoped to one scenario's own recency window and never caught that).
`pickRandomScenario()` (`domain.ts`) also blends each scenario's real win rate
into its pick weight, gated by the Exploration slider — low explore leans into
proven scenarios, high explore flattens back toward the static weights and
boosts scenarios with too little data to judge yet. Settings' win-rate card
and the lab's "Brain says" strip both read from this same module.

### AI-invented concepts ("Surprise concept")
A "💡 Surprise concept" button (next to the Scenario select) asks the model to
invent a brand-new short-form concept from scratch — grounded in the playbook
and an avoid-list of concepts already tried/saved (`CONCEPT_SYSTEM` /
`buildConceptMessage` / `parseConcept` in `prompts.ts`, `concept:suggest` IPC
in `main/index.ts`) — and generates from it immediately. The result is just a
synthetic `Scenario` (`id: 'concept:<id>'`), so it flows through
`buildUserMessage` exactly like any other open scenario with no special-casing
needed. A good one-off can be promoted via "💾 Save this concept" into a small
user-curated library (`concepts.json`, `SavedConcept` in `types.ts`,
`getSavedConcepts`/`setSavedConcepts` in `store.ts`) — deliberately **not**
wiped by "Reset all memory", since it's content the user chose to keep, not
learned drift. Saved concepts appear in the Scenario dropdown and in a
Settings card for management. `Entry.conceptBrief` carries the invented brief
text, since (unlike fixed scenarios) it has no static home to look it up from.

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

This repo lives at `C:\xampp\htdocs\livery-studio` (local disk, so `node_modules`
works here) — run it with `npm run dev`. The Lab's repo is
`C:\xampp\htdocs\prompt-engine`; leave it alone unless asked.
