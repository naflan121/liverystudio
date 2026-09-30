import { contextBridge, ipcRenderer } from 'electron'
import type { BrainstormIdea } from '../shared/brainstorm'
import type { RenderCheckResult } from '../shared/renderCheck'
import type {
  AppConfig, Entry, GenerateRequest, GenerateResult, LearningLogEntry, CliTestResult, LogLine, SavedConcept, RenderJob, RenderOverview, ReviewVerdict, UsageRow,
} from '../shared/types'

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (patch: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:set', patch),
  getHistory: (): Promise<Entry[]> => ipcRenderer.invoke('history:get'),
  setHistory: (entries: Entry[]): Promise<boolean> => ipcRenderer.invoke('history:set', entries),
  getPlaybook: (): Promise<string> => ipcRenderer.invoke('playbook:get'),
  setPlaybook: (text: string): Promise<boolean> => ipcRenderer.invoke('playbook:set', text),
  getLearningLog: (): Promise<LearningLogEntry[]> => ipcRenderer.invoke('learning:log'),
  generate: (req: GenerateRequest): Promise<GenerateResult> => ipcRenderer.invoke('generate', req),
  /** Candidate mode: N distinct prompts from one CLI call (no titles — write one for the chosen candidate). */
  generateBatch: (req: GenerateRequest): Promise<GenerateResult[]> => ipcRenderer.invoke('generate:batch', req),
  title: (payload: { text: string; avoid: string[] }): Promise<string> => ipcRenderer.invoke('title', payload),
  caption: (payload: { text: string; title: string }): Promise<string> => ipcRenderer.invoke('caption', payload),
  getPlaybookVersions: (): Promise<{ ts: string; text: string }[]> => ipcRenderer.invoke('playbook:versions'),
  learn: (entry: Entry): Promise<{ playbook: string }> => ipcRenderer.invoke('learn', entry),
  redistill: (): Promise<{ playbook: string; used: number }> => ipcRenderer.invoke('learn:redistill'),
  identifyScene: (text: string): Promise<{ aircraft: string; environment: string }> => ipcRenderer.invoke('scene:identify', text),
  backfillCoverage: (): Promise<{ history: Entry[]; filled: number }> => ipcRenderer.invoke('coverage:backfill'),
  getTrends: (): Promise<{ text: string; updatedAt: string }> => ipcRenderer.invoke('trends:get'),
  setTrends: (text: string): Promise<{ text: string; updatedAt: string }> => ipcRenderer.invoke('trends:set', text),
  refreshTrends: (): Promise<{ text: string; updatedAt: string }> => ipcRenderer.invoke('trends:refresh'),
  testCli: (): Promise<CliTestResult> => ipcRenderer.invoke('cli:test'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('data:open'),
  getDataDir: (): Promise<string> => ipcRenderer.invoke('data:getDir'),
  setDataDir: (dir: string): Promise<{ ok: boolean; message: string; dir: string }> => ipcRenderer.invoke('data:setDir', dir),
  browseDataDir: (): Promise<string> => ipcRenderer.invoke('data:browse'),
  resetMemory: (): Promise<boolean> => ipcRenderer.invoke('memory:reset'),
  /** Invent a fresh one-off scenario concept (see CONCEPT_SYSTEM in shared/prompts). */
  suggestConcept: (): Promise<{ label: string; brief: string }> => ipcRenderer.invoke('concept:suggest'),
  /** Livery Studio: N ranked concepts from one call on the learning model (see shared/brainstorm). */
  brainstormConcepts: (n: number): Promise<BrainstormIdea[]> => ipcRenderer.invoke('concept:brainstorm', n),
  getSavedConcepts: (): Promise<SavedConcept[]> => ipcRenderer.invoke('concepts:get'),
  saveConcept: (payload: { label: string; brief: string; sourceEntryId?: number }): Promise<SavedConcept> => ipcRenderer.invoke('concepts:save', payload),
  deleteConcept: (id: number): Promise<SavedConcept[]> => ipcRenderer.invoke('concepts:delete', id),
  // --- Livery Studio: render pipeline ---
  renderOverview: (): Promise<RenderOverview> => ipcRenderer.invoke('render:overview'),
  /** Queue renders for these history entry ids (an entry with a live job just returns it). */
  /** opts.references overrides Settings → Render → reference images for these renders. */
  renderSubmit: (entryIds: number[], opts?: { references?: boolean }): Promise<RenderJob[]> => ipcRenderer.invoke('render:submit', entryIds, opts),
  renderCancel: (jobId: string): Promise<boolean> => ipcRenderer.invoke('render:cancel', jobId),
  /** Read the job's latest Dola reply and have a cheap model explain it. */
  renderCheck: (jobId: string): Promise<RenderCheckResult> => ipcRenderer.invoke('render:check', jobId),
  /** After a Check: re-render, move to another account, or cancel; cooldownMinutes rests its current account. */
  renderAct: (jobId: string, action: 'rerender' | 'move' | 'cancel', cooldownMinutes?: number): Promise<boolean> => ipcRenderer.invoke('render:act', jobId, action, cooldownMinutes),
  renderClearCooldown: (id: number): Promise<boolean> => ipcRenderer.invoke('render:clearCooldown', id),
  // Dola instance manager
  instanceClearCredits: (id: number): Promise<boolean> => ipcRenderer.invoke('instances:clearCredits', id),
  instanceResetUsage: (id?: number): Promise<boolean> => ipcRenderer.invoke('instances:resetUsage', id),
  instanceStart: (id: number): Promise<boolean> => ipcRenderer.invoke('instances:start', id),
  instanceShow: (id: number): Promise<boolean> => ipcRenderer.invoke('instances:show', id),
  /** Reserve (never auto-render on) or release an account; returns the updated config. */
  instanceReserve: (id: number, on: boolean): Promise<AppConfig> => ipcRenderer.invoke('instances:reserve', id, on),
  /** fresh=false re-checks the job's existing Dola chat; fresh=true renders again from scratch. */
  renderRetry: (jobId: string, fresh: boolean): Promise<boolean> => ipcRenderer.invoke('render:retry', { jobId, fresh }),
  renderRemove: (jobId: string): Promise<boolean> => ipcRenderer.invoke('render:remove', jobId),
  renderOpenFile: (file: string): Promise<string> => ipcRenderer.invoke('render:openFile', file),
  renderShowFile: (file: string): Promise<boolean> => ipcRenderer.invoke('render:showFile', file),
  renderOpenOutput: (): Promise<string> => ipcRenderer.invoke('render:openOutput'),
  renderBrowseOutput: (): Promise<string> => ipcRenderer.invoke('render:browseOutput'),
  onRenderChanged: (cb: (jobs: RenderJob[]) => void): (() => void) => {
    const handler = (_e: unknown, jobs: RenderJob[]): void => cb(jobs)
    ipcRenderer.on('render:changed', handler)
    return () => { ipcRenderer.removeListener('render:changed', handler) }
  },
  importFromLab: (): Promise<{ imported: string[]; from: string }> => ipcRenderer.invoke('brain:importLab'),
  /** Re-read history and pull in prompts created in Livery Lab since the import (append-only). */
  refreshHistory: (): Promise<{ history: Entry[]; added: number }> => ipcRenderer.invoke('history:refresh'),
  // --- Livery Studio: review ---
  reviewDecide: (jobId: string, verdict: ReviewVerdict, reasons: string[], comment: string): Promise<RenderJob> => ipcRenderer.invoke('review:decide', { jobId, verdict, reasons, comment }),
  reviewUndo: (jobId: string): Promise<RenderJob> => ipcRenderer.invoke('review:undo', jobId),
  reviewRerender: (entryId: number): Promise<RenderJob> => ipcRenderer.invoke('review:rerender', entryId),
  /** One Claude call: rewrite the prompt from the rejection reasons + render lessons, then render it. */
  reviewRewrite: (entryId: number): Promise<Entry> => ipcRenderer.invoke('review:rewrite', entryId),
  reviewUnusable: (entryId: number): Promise<boolean> => ipcRenderer.invoke('review:unusable', entryId),
  reviewStats: (): Promise<{ scenarios: { scenario: string; approved: number; rejected: number }[]; reasons: { reason: string; n: number }[] }> => ipcRenderer.invoke('review:stats'),
  getRenderLessons: (): Promise<string> => ipcRenderer.invoke('review:lessons:get'),
  setRenderLessons: (text: string): Promise<boolean> => ipcRenderer.invoke('review:lessons:set', text),
  /** Main changed history on its own (e.g. a rewritten prompt) — reload it. */
  onHistoryChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('history:changed', handler)
    return () => { ipcRenderer.removeListener('history:changed', handler) }
  },
  // --- Livery Studio: queue pause, usage meter, notifications ---
  renderPause: (): Promise<boolean> => ipcRenderer.invoke('render:pause'),
  renderResume: (): Promise<boolean> => ipcRenderer.invoke('render:resume'),
  /** Forget which Dola accounts are resting on credits (e.g. after topping one up). */
  renderClearCredits: (): Promise<boolean> => ipcRenderer.invoke('render:clearCredits'),
  usageSummary: (days: number): Promise<{ today: UsageRow[]; byDay: UsageRow[]; byModelToday: UsageRow[]; byProviderToday: UsageRow[] }> => ipcRenderer.invoke('usage:summary', days),
  testNotification: (): Promise<boolean> => ipcRenderer.invoke('notify:test'),
  // --- MiniMax engine + AI pre-check ---
  miniMaxStatus: (): Promise<{ installed: boolean; cli: string | null; models: { id: string; video: boolean }[] }> => ipcRenderer.invoke('minimax:status'),
  miniMaxTest: (model: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('minimax:test', model),
  runPrecheck: (jobId: string): Promise<boolean> => ipcRenderer.invoke('precheck:run', jobId),
  precheckAgreement: (): Promise<{ compared: number; agreed: number; falseRejects: number; missedRejects: number }> => ipcRenderer.invoke('precheck:agreement'),
  /** A clicked notification asks the window to open a screen. */
  onNav: (cb: (view: string) => void): (() => void) => {
    const handler = (_e: unknown, view: string): void => cb(view)
    ipcRenderer.on('nav', handler)
    return () => { ipcRenderer.removeListener('nav', handler) }
  },
  getLabDataDir: (): Promise<string> => ipcRenderer.invoke('brain:labDir'),
  /** Subscribe to real-time activity log lines. Returns an unsubscribe fn. */
  onLog: (cb: (line: LogLine) => void): (() => void) => {
    const handler = (_e: unknown, line: LogLine): void => cb(line)
    ipcRenderer.on('log:line', handler)
    return () => { ipcRenderer.removeListener('log:line', handler) }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
