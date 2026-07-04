import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig, Entry, GenerateRequest, GenerateResult, LearningLogEntry, CliTestResult, LogLine,
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
  /** Subscribe to real-time activity log lines. Returns an unsubscribe fn. */
  onLog: (cb: (line: LogLine) => void): (() => void) => {
    const handler = (_e: unknown, line: LogLine): void => cb(line)
    ipcRenderer.on('log:line', handler)
    return () => { ipcRenderer.removeListener('log:line', handler) }
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
