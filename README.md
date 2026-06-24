# Livery Lab (desktop)

Self-learning desktop app that generates Seedance 2.0 image-to-video prompts for
RC scale-model aircraft, optimised for social reach. Electron + React + the
locally-installed **Claude Code CLI** (no API key needed). See
[`REQUIREMENTS.md`](./REQUIREMENTS.md) for the full spec.

---

## ⚠️ Important: where this project lives

A Node/Electron project **cannot** be developed directly on Google Drive — the
`node_modules` folder is tens of thousands of files and Drive's sync layer locks
them (causing `EPERM` / `EBADF` install errors) and would try to sync them
forever.

- **Source of record (this folder, on Google Drive):** the code + docs, for
  backup and reference. Safe to keep here — source files sync fine.
- **Working copy (local disk):** `C:\Users\User\LiveryLab` — where you actually
  run `npm install`, develop, and build. This folder is NOT on Drive.

The two are kept in sync by copying the `src/` folder and config files (never
`node_modules`, `out`, or `release`).

---

## Prerequisites

- **Node.js** (v20+; tested on v24) and **npm**
- **Claude Code CLI** installed and logged in (`claude` on your PATH). The app
  shells out to it and reuses your existing login — no API key required.

## Run in development

```sh
cd C:\Users\User\LiveryLab
npm install        # first time only
npm run dev        # launches the app with hot-reload
```

## Build the portable app (Windows)

```sh
cd C:\Users\User\LiveryLab
npm run package:win   # output: .\release\Livery Lab-win32-x64\  (a portable folder)
```

This produces a **portable folder** (~270 MB) containing `Livery Lab.exe` and its
resources — no installer, no admin rights, no code-signing needed. Just copy the
folder and run the `.exe`.

> We use `@electron/packager` (not electron-builder) on purpose: a single
> self-extracting portable .exe re-unpacks to a temp dir on every launch, which is
> slow from Google Drive. A packaged folder runs directly.

## Using it portably across multiple Windows PCs

1. Build the portable folder (above), then **zip it and put the zip on Google
   Drive**.
2. On each PC: download + unzip to a **local disk** folder (not run from inside
   Drive — Drive's virtual filesystem makes the .exe slow/flaky to launch), then
   run `Livery Lab.exe`.
3. Install + log in to **Claude Code** once on that PC (`claude` — the app reuses
   that login; it cannot carry your login with it).
4. In **Settings → Data folder**, click **Choose folder…** and pick one shared
   **Google Drive folder** (e.g. `…\LiveryLab-data`). Do this on every PC, pointing
   them all at the same Drive folder.

Now your history and learned playbook **follow you to every device** — score a
reel on one PC and the others already know.

⚠️ **Don't run the app on two PCs at the same time** — both writing to the shared
data files on Drive can cause sync conflicts. Sequential use is fine.

## First run

1. Open **Settings → Test connection** to confirm the app can reach the Claude
   CLI and that you are logged in.
2. (Optional) Set the **Data folder** to a Drive path for multi-device sync.
3. Go back to the lab, set your levers, and click **Generate prompt**.
4. Copy the prompt into Seedance 2.0 (with your reference image for the livery).
5. After posting the reel, reopen the entry from the queue and **log the result**
   — that teaches the playbook.

## Where your data lives

History, the learned playbook, settings, and the learning log live in your chosen
**Data folder** (default: this PC's Electron `userData`; set it to a Drive folder
for sync). Open it any time via **Settings → Open folder**. A tiny per-device
pointer file (`location.json`) in `userData` just records which data folder this PC
uses.

## Project layout

```
src/
  main/        Electron main process — CLI wrapper, file store, IPC
  preload/     contextBridge API exposed to the UI
  shared/      domain options + prompt templates (used by main and renderer)
  renderer/    React UI (lab + settings)
```
