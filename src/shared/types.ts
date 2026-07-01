export type ReachId = 'flop' | 'normal' | 'good' | 'viral'
export type StatusId = 'queued' | 'posted' | 'scored' | 'skipped'

export type LogLevel = 'info' | 'step' | 'ok' | 'warn' | 'err'

export interface LogLine {
  ts: number
  level: LogLevel
  msg: string
}

export interface Scenario {
  id: string
  label: string
  group: string
  brief: string
}

export interface Entry {
  id: number
  text: string
  title: string
  filename: string
  scenario: string
  scenarioId: string
  aircraft: string
  /** The specific aircraft the engine actually named (any Claude-picks mode), e.g. "American Airlines A320" or "USAF F-16". Recorded only on a Good/Viral score. Used for per-scenario variety. */
  pickedAircraft?: string
  /** The environment/setting the rendered clip actually used, e.g. "grass farmland field", "coastal". Recorded on a Good/Viral score for coverage. */
  pickedEnv?: string
  /** User opt-out: when true, this entry is never added to airline coverage, even on a Good/Viral score. */
  excludeCoverage?: boolean
  crowd: string
  env: string
  hook: boolean
  multiShot: boolean
  /** Optional: engineer a scroll-stopping first ~1 second / strong first frame. */
  punchyOpen?: boolean
  status: StatusId
  postedAt: number | null
  reach: ReachId | null
  tags: string[]
  comment: string
  ts: string
}

export interface GenerateRequest {
  resolved: Scenario
  aircraft: string
  crowd: string
  env: string
  hook: boolean
  multiShot: boolean
  punchyOpen: boolean
  /** Opt-in: restrict the aircraft's airline/operator to Tier-1 (Western developed) countries, e.g. to steer away from repeat picks like ANA. */
  tier1Only: boolean
  /** Opt-in: feed recent Good/Viral environments for this scenario so the engine varies the setting. */
  varyCoverage: boolean
  /** Opt-in: inject the current trends digest so the engine can ride what's hot. */
  useTrends: boolean
  explore: number
  nudge: string
}

export interface GenerateResult {
  text: string
  title: string
  filename: string
}

export interface AppConfig {
  cliPath: string
  generationModel: string
  learningModel: string
  timeoutMs: number
  charLimit: number
  targetMin: number
  targetMax: number
  playbookBudget: number
  autoLearn: boolean
  titleEnabled: boolean
  titleMaxLen: number
  extraNegatives: string
  defaults: {
    scenario: string
    aircraft: string
    crowd: string
    env: string
    explore: number
    hook: boolean
    multiShot: boolean
  }
}

export interface LearningLogEntry {
  ts: string
  reach: ReachId | null
  scenario: string
  before: number
  after: number
}

export interface CliTestResult {
  ok: boolean
  path: string
  message: string
}
