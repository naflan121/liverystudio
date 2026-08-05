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
  /** Random-pick weight (default 1). Scenarios with proven virality carry >1 so "Random" leans toward the formats most likely to break out. */
  weight?: number
  /** Per-scenario character budget for the generated prompt. Overrides config.charLimit — some formats (e.g. ramp_glide) need a longer, geometry-matched Negative list than 1500 chars allows. */
  charBudget?: number
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
  /** Camera identity lever used for this clip ('auto' | 'phone' | 'longlens' | 'broadcast'). Feeds the learner. */
  camera?: string
  /** Whether the Tier-1 countries restriction was on — evidence for the learner (the aircraft pick wasn't free). */
  tier1Only?: boolean
  /** Operator-region lever: 'any' | 'tier1' | 'europe'. Supersedes tier1Only (kept for old entries). */
  region?: string
  /** Social caption + hashtags written for this clip (on demand). */
  caption?: string
  /** id of the Good/Viral entry this one was remixed from — evidence for the learner. */
  remixOf?: number
  /** Reach Boost was ON for this generation (ceiling-attempt biases from the performance report). A/B-tracked. */
  boost?: boolean
  /** Approximate all-time view count entered at scoring time (optional) — hard data for future analysis. */
  views?: number
  /** Whether the trends digest was injected for this generation. */
  useTrends?: boolean
  /** The user's one-off direction for this prompt — key evidence for the learner (overrides the levers). */
  nudge?: string
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
  /** Camera identity: 'auto' (Claude decides) | 'phone' | 'longlens' | 'broadcast'. */
  camera?: string
  hook: boolean
  multiShot: boolean
  punchyOpen: boolean
  /** Opt-in: restrict the aircraft's airline/operator to Tier-1 (Western developed) countries, e.g. to steer away from repeat picks like ANA. Kept for back-compat; derived from region === 'tier1'. */
  tier1Only: boolean
  /** Operator-region restriction: 'any' (default) | 'tier1' (US/CA/UK/AU/NZ) | 'europe'. */
  region?: string
  /** Remix mode: the full text of a proven winner to rework — keep its winning ingredients, change the surface. */
  remixText?: string
  /** Ask for N distinct prompts in ONE CLI call (candidate mode). 1 or absent = normal single prompt. */
  candidates?: number
  /** Opt-in Reach Boost: bias open choices toward the performance report's highest-ceiling patterns. Fully discardable — off means byte-identical behavior to before. */
  boost?: boolean
  /** Opt-in: feed recent Good/Viral environments for this scenario so the engine varies the setting. */
  varyCoverage: boolean
  /** Opt-in: inject the current trends digest so the engine can ride what's hot. */
  useTrends: boolean
  explore: number
  nudge: string
  /** Skip the SEO-title step for this call (candidate mode generates the title only for the chosen one). */
  skipTitle?: boolean
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
    camera?: string
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
