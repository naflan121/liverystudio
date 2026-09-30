import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig, Entry, GenerateRequest, GenerateResult, LearningLogEntry, CliTestResult, LogLine, SavedConcept, RenderJob, RenderOverview,
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
  getSavedConcepts: (): Promise<SavedConcept[]> => ipcRenderer.invoke('concepts:get'),
  saveConcept: (payload: { label: string; brief: string; sourceEntryId?: number }): Promise<SavedConcept> => ipcRenderer.invoke('concepts:save', payload),
  deleteConcept: (id: number): Promise<SavedConcept[]> => ipcRenderer.invoke('concepts:delete', id),
  // --- Livery Studio: render pipeline ---
  renderOverview: (): Promise<RenderOverview> => ipcRenderer.invoke('render:overview'),
  /** Queue renders for these history entry ids (an entry with a live job just returns it). */
  renderSubmit: (entryIds: number[]): Promise<RenderJob[]> => ipcRenderer.invoke('render:submit', entryIds),
  renderCancel: (jobId: string): Promise<boolean> => ipcRenderer.invoke('render:cancel', jobId),
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
