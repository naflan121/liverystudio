# Livery Lab — Desktop App Requirements & Spec

> **Purpose of this document:** the single source of truth for converting the
> existing `rc-prompt-lab-v3.1.jsx` Claude.ai artifact into a standalone,
> self-learning desktop application. Written so that any engineer (or a fresh
> Claude session) can pick this up cold without re-explaining the vision.
>
> **Status:** Approved direction, not yet built.
> **Last updated:** 2026-06-21
> **Owner:** Sholacase (mohamed.naflan@mpsb.net)

---

## 1. Vision (the one-paragraph version)

Sholacase produces short-form social videos of **RC scale-model aircraft** filmed
to look like genuine full-size aviation footage — the "is this real?" illusion —
optimised for **reach** on Facebook Reels / YouTube Shorts. The prompts are
written for **Seedance 2.0** (image-to-video). Today the tool is a Claude.ai
artifact; as output volume grows we need a **proper desktop app** that (a) runs
locally and reliably, (b) generates prompts using the **Claude Code CLI already
installed on the PC** (no API key to manage), and (c) **genuinely learns** from
the real-world performance of every posted video — while keeping its memory
**compact and bounded** so it never bloats over months of use.

---

## 2. Locked decisions

These were decided with the owner and should not be re-litigated without reason.

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| D1 | Desktop framework | **Electron** | Node main process makes shelling out to the Claude CLI and local file I/O trivial; existing React UI ports almost as-is. |
| D2 | AI backend | **Claude Code CLI, headless** (`claude -p`) | Reuses existing Claude Code auth — no API key to store or leak. This is the "use the harness we already have installed" requirement. |
| D3 | Self-learning memory | **AI-distilled playbook** | One compact, evolving "what works" document that AI rewrites tighter on each feedback. Token/context usage stays roughly constant regardless of how long the app is used — directly solves the "memory piles up" concern. |
| D4 | Users / sync | **Single user, this PC, local files** | Simplest. No cloud/team sync in v1. Data model should not actively prevent a future shared-folder sync, but we are not building it now. |

---

## 3. What carries over from the current artifact

The existing `rc-prompt-lab-v3.1.jsx` already nails the **domain logic** — keep it.
Specifically preserve:

- The **`SYSTEM` prompt** (scale-illusion rules, livery economy, aerodynamic
  realism, the long-ground-roll takeoff discipline, anti-AI imperfections,
  single-continuous-shot default, mandatory Negative terms).
- The **`TITLE_SYSTEM`** prompt and title generation (SEO-friendly, varied,
  <70 chars, safe-filename charset).
- The **scenario / aircraft / crowd / environment** option sets and their
  descriptive text.
- The **per-prompt controls**: Hook mode, multi-shot toggle, exploration slider,
  free-text "direction" nudge, randomised region/force/era variety injection.
- The **workflow loop**: generate → queue → copy → post → come back later →
  score (Flopped / Normal / Good / Viral) + comment + illusion-check tags.
- Title **avoid-list** (don't echo recent titles) and auto **`.mp4` filename**
  derivation.
- The 1500-char Seedance hard limit, with the **auto-rewrite-if-over** behaviour
  (ask the model to shorten, rather than hard-truncating).

### What changes / gets replaced

- **API call mechanism** → replaced. The artifact's raw `fetch` to
  `api.anthropic.com` (no auth headers) never worked standalone. Replace with
  CLI invocation through the Electron main process.
- **`window.storage`** → replaced with real local file persistence.
- **`learningContext()` raw-history dump** → replaced. Today it pastes growing
  raw history (best prompts + scoreboard + recent comments) into every
  generation. This is exactly the "memory piles up" problem. Replace with the
  **distilled playbook** (Section 6).

---

## 4. Architecture

### 4.1 Process model (Electron)

```
┌──────────────────────────────────────────────────────────┐
│ Main process (Node.js)                                     │
│  • Owns the file system (config, history, playbook)        │
│  • Spawns the Claude Code CLI (child_process)              │
│  • Enforces size budgets / runs the learning pass          │
│  • Exposes a small, typed IPC API via preload + contextBridge│
└───────────────▲───────────────────────────┬───────────────┘
                │ IPC (invoke/handle)         │
┌───────────────┴───────────────────────────▼───────────────┐
│ Renderer (React)  — the ported UI                          │
│  • Generate screen, queue/list, score panel                │
│  • Settings page                                           │
│  • Never touches fs or spawns processes directly           │
└────────────────────────────────────────────────────────────┘
```

**Security:** `contextIsolation: true`, `nodeIntegration: false`, renderer talks
to main only through a narrow `window.api` bridge. No remote content loaded.

### 4.2 Recommended stack

- Electron + **Vite** + **React** + **TypeScript**
- **electron-builder** for packaging (Windows NSIS installer first; the dev PC is
  Windows 11)
- Keep the current inline-style UI initially to minimise porting churn; a styling
  refactor is optional later.

### 4.3 Claude Code CLI invocation (D2)

The main process spawns the installed CLI in non-interactive print mode. Intended
shape (exact flags to be **validated during build** against the installed
version):

```
claude -p "<user message>" \
  --append-system-prompt "<SYSTEM or TITLE_SYSTEM or LEARN_SYSTEM>" \
  --model <configured model> \
  --output-format json
```

Wrapper responsibilities:
- Locate the CLI: auto-detect on PATH; allow an explicit path override in Settings.
- Capture stdout, parse the result, strip any non-prompt preamble.
- Handle failure modes with clear UI messages: **CLI not found**, **not
  authenticated / logged out**, **timeout**, **non-zero exit**, **empty output**.
- Enforce a configurable timeout.
- Serialise calls: never run a generation and a learning pass at the same time.

> **Open item (O1):** confirm the exact CLI flags, the JSON output schema, how the
> system prompt is best supplied, and that tool use can be disabled (we only want
> text generation, not an agentic run). Verify against the installed Claude Code
> before finalising the wrapper.

### 4.4 Three AI call types

| Call | System prompt | Trigger | Output |
|------|---------------|---------|--------|
| **Generate** | `SYSTEM` (+ playbook injected into user msg) | "Generate prompt" | Visual/Audio/Negative prompt, <1500 chars |
| **Title** | `TITLE_SYSTEM` | after generate / "New title" | one <70-char title |
| **Learn (distill)** | `LEARN_SYSTEM` (new — Section 6.3) | on each feedback (debounced) | rewritten compact `playbook.md` |

---

## 5. Data model & local storage (D4)

All data lives under the Electron `userData` directory (overridable in Settings).

| File | Format | Contents | Goes into AI context? |
|------|--------|----------|-----------------------|
| `config.json` | JSON | All settings (Section 7) | No |
| `history.json` | JSON | Every entry: queued / posted / scored / skipped, with reach, comment, tags, title, filename, levers, timestamps | **No** (display + scoreboard only) |
| `playbook.md` | Markdown | The single distilled "what works" document | **Yes** (the only learning context sent to Generate) |
| `learning-log.jsonl` | JSONL | Append-only audit of each learning pass (before/after size, what was added) | No |

**Entry shape** (unchanged from artifact, persisted to disk):
`{ id, text, title, filename, scenario, aircraft, crowd, env, hook, multiShot,
status, postedAt, reach, tags, comment, ts }`

**Key principle:** raw `history.json` can grow without limit (it's just an audit
log and the scoreboard source), but it is **never** sent to the model. Only the
**bounded `playbook.md`** is. This is what keeps context cost flat over time.

**Migration:** none. The old artifact's history lived in Claude.ai artifact
storage and is not accessible to the desktop app. Fresh start. (If the owner can
export old data manually we can add a one-off importer later.)

---

## 6. Self-learning: the distilled playbook (D3) — the heart of the app

### 6.1 The problem we are solving

The artifact's `learningContext()` appends the 3 best prompts (full text), a
running scoreboard, and the last 5 comments into **every** generation message.
Over months this grows, wastes context, and gets noisier. We want learning that
gets **better and smaller**, not bigger.

### 6.2 The mechanism

Maintain **one** living document, `playbook.md`, with a **hard size budget**
(default target ~1500–2500 characters, configurable). Suggested structure:

```
# Livery Lab Playbook  (auto-maintained — do not hand-edit unless you mean it)

## Winning ingredients (reuse, fresh scene each time)
- ...

## What flops (avoid / fix)
- ...

## Aircraft & livery patterns that pull reach
- ...

## Crowd & environment patterns
- ...

## Hook-mode learnings
- ...

## Open hypotheses (try and confirm)
- ...
```

**On every feedback** (reach score logged, and/or comment/tags added):

1. Main process gathers: current `playbook.md` + the one new scored result
   (its prompt, reach tier, comment, illusion tags, levers used).
2. Sends them to the **Learn (distill)** call with `LEARN_SYSTEM`.
3. The model **merges** the new lesson into the playbook and **rewrites the whole
   thing tighter**, staying under the size budget — generalising and dropping
   stale/duplicate specifics rather than appending.
4. New playbook is written to `playbook.md`; the pass is recorded in
   `learning-log.jsonl`.

**Debounce:** if the user logs several results quickly, batch them into one
learning pass (e.g. 2–3 s after the last change, or a "process N pending" call)
to avoid spamming the CLI.

**Generation** then injects only the compact `playbook.md` — no raw history.

### 6.3 `LEARN_SYSTEM` prompt (to be written, behaviour spec)

Must instruct the model to:
- Treat the playbook as a compact, durable strategy doc — **merge, don't append**.
- Stay strictly under the character budget; when full, **compress/generalise**
  older points to make room, keeping only what still earns its place.
- Weight by reach tier (viral ≫ good ≫ normal ≫ flop) and by repeated signals
  over one-offs.
- Preserve hard rules (the scale-illusion / aerodynamic discipline lives in
  `SYSTEM`, not here — the playbook is *learned tactics on top*).
- Output **only** the rewritten markdown, nothing else.

### 6.4 Transparency (keep the artifact's honesty)

Keep an equivalent of the "How learning works" panel: show the **current
playbook** verbatim (it's exactly what gets sent), plus the learning log, so the
owner always sees what the app believes and why. Allow manual **"re-distill
now"**, **edit playbook**, and **reset memory**.

---

## 7. Settings page (put all options here)

A dedicated Settings screen. Groups:

**AI / model**
- Claude CLI path (auto-detected, overridable) + a "Test connection" button
- Model for generation (default `claude-sonnet-4-6`; allow `claude-opus-4-8` for
  higher quality)
- Model for learning/distillation (can default to the same)
- Request timeout, max output tokens

**Generation defaults**
- Default scenario / aircraft / crowd / environment
- Default exploration level, default hook mode, default multi-shot
- Character limit (default 1500) and target band (default 1400–1490)

**Memory / learning**
- Playbook size budget (chars)
- Auto-learn on feedback: on/off
- Buttons: Re-distill now · View/Edit playbook · View learning log · Reset memory
- Export / Import memory (playbook + history)

**Prompt content**
- Editable **base Negative terms** list (fixes the old hardcoded-tags limitation)
- View/edit the `SYSTEM` and `TITLE_SYSTEM` prompts (advanced)

**Titles**
- Enable/disable title generation, max length (default 70)

**Data**
- Data folder location (open / change)
- Backup / export all, clear all

**Appearance** (optional)
- Light/dark, accent colour

---

## 8. Core user workflow (must stay intact)

1. Set levers (or accept defaults) → **Generate**.
2. App calls CLI with `SYSTEM` + injected playbook → prompt appears; if >1500
   chars, auto-rewrite shorter. Title generated.
3. Prompt lands in the **queue** as "awaiting result". Copy prompt / title /
   filename.
4. Owner posts the reel on Facebook (outside the app).
5. Any time later: open the entry from the filterable list (To score / Scored /
   Skipped / All), **log reach** + comment + illusion tags.
6. Logging a result triggers the **learning pass** → playbook updates.
7. Next generation is smarter, context stays compact.

---

## 9. Build plan (phased)

1. **Scaffold** — Electron + Vite + React + TS; window, contextIsolation, preload
   bridge; electron-builder config.
2. **Port UI** — move the artifact's components/styles into the renderer.
3. **CLI wrapper** — main-process module that spawns `claude -p`, parses output,
   handles all failure modes; "Test connection" in Settings. *(Resolve O1 here.)*
4. **Persistence** — `config.json` + `history.json` read/write via IPC; replace
   `window.storage`.
5. **Playbook learning** — `playbook.md`, `LEARN_SYSTEM`, distill-on-feedback,
   debounce, learning log; wire generation to inject playbook instead of raw
   history.
6. **Settings page** — all options from Section 7.
7. **Packaging** — Windows NSIS installer; app icon; first-run onboarding that
   checks the CLI is present and authenticated.
8. **Polish** — error states, empty states, backups/export.

---

## 10. Open questions / to confirm

- **O1 (build-blocking):** exact Claude Code CLI flags, JSON output schema, system-
  prompt delivery, and disabling tool use. Validate against the installed version.
- **O2:** Should the app also **manage the Seedance reference image** per model
  (store/organise the car/plane reference photos alongside each prompt)? Currently
  out of scope; candidate for v2.
- **O3:** Auto-update mechanism (electron-updater) — needed, or manual installs
  are fine for a single user?
- **O4:** Cost/latency tolerance for a learning pass on **every** feedback vs a
  manual/batched "learn now". Default is auto + debounce; revisit if it feels slow.
- **O5:** Backup cadence / where (the project lives in a Google Drive path — Drive
  may already provide versioning; confirm whether that's the backup story).

---

## 11. Glossary

- **Seedance 2.0** — the AI image-to-video platform the prompts target. 1500-char
  hard limit. Reference image supplies the livery.
- **Reach tiers** — Flopped / Normal / Good / Viral; the performance signal that
  drives learning.
- **Hook mode** — one photoreal-but-impossible structural feature for a viral
  double-take (kept real-looking, never a CGI glitch).
- **Playbook** — the single distilled, size-bounded learning document; the only
  learned context sent to the model at generation time.
- **Livery economy** — naming the aircraft/airline briefly and spending no
  characters on paint detail (the reference image handles that).
