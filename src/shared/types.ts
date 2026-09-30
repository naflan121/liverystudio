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
  /** Optional filename prefix (e.g. "CliffDrop") stamped onto every generated filename for this scenario, so clips sort/identify by scenario regardless of the AI-written title. */
  filenamePrefix?: string
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
  /** Livery Studio: id of the first prompt in a chain of rewrites made because every rendered take was rejected. */
  fixOf?: number
  /** Reach Boost was ON for this generation (ceiling-attempt biases from the performance report). A/B-tracked. */
  boost?: boolean
  /** Long-prompt mode was ON (4800-char budget) — evidence for the learner on whether longer prompts score better. */
  longPrompt?: boolean
  /** Approximate all-time view count entered at scoring time (optional) — hard data for future analysis. */
  views?: number
  /** Whether the trends digest was injected for this generation. */
  useTrends?: boolean
  /** The user's one-off direction for this prompt — key evidence for the learner (overrides the levers). */
  nudge?: string
  /** The AI-invented scenario brief, present when scenarioId starts with 'concept:' (one-off or generated from a saved concept). Fixed scenarios don't need this — their brief lives in SCENARIOS by id — but an invented one has no static home. */
  conceptBrief?: string
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
  /** Opt-in long-prompt mode: lift the char limit to LONG_PROMPT_CHARS (4800) for platforms that accept long prompts — extra room for physics, scale cues and negatives. */
  longPrompt?: boolean
  /** Livery Studio: the long-prompt limit from Settings (set by the main process). Absent = LONG_PROMPT_CHARS. */
  longPromptChars?: number
  /** Opt-in: feed recent Good/Viral environments for this scenario so the engine varies the setting. */
  varyCoverage: boolean
  /** Opt-in: inject the current trends digest so the engine can ride what's hot. */
  useTrends: boolean
  explore: number
  nudge: string
  /** Skip the SEO-title step for this call (candidate mode generates the title only for the chosen one). */
  skipTitle?: boolean
  /** Livery Studio: scene labels (setting · camera · light) already written earlier in this lineup — variety context. */
  batchUsed?: string[]
}

export interface GenerateResult {
  text: string
  title: string
  filename: string
}

export interface AppConfig {
  cliPath: string
  /** A Claude model id, or 'minimax:<model id>' to run on MiniMax (mcode). */
  generationModel: string
  /** Same format as generationModel. */
  learningModel: string
  timeoutMs: number
  charLimit: number
  /** Livery Studio: character limit when Long prompt is on (Dola accepts long prompts). */
  longPromptChars: number
  targetMin: number
  targetMax: number
  playbookBudget: number
  autoLearn: boolean
  titleEnabled: boolean
  titleMaxLen: number
  extraNegatives: string
  /** Livery Studio: phrases you reuse in "Direction for this one" — one click adds them. */
  directionSnippets?: string[]
  defaults: {
    scenario: string
    aircraft: string
    crowd: string
    env: string
    camera?: string
    explore: number
    hook: boolean
    multiShot: boolean
    /** Livery Studio: Long prompt lever on by default. */
    longPrompt?: boolean
  }
  /** Livery Studio: how prompts get rendered into video on Dola (DolaMultiBrowser). */
  render: RenderSettings
  /** Livery Studio: review of rendered videos + learning from rejections. */
  review: ReviewSettings
  /** Livery Studio: which Windows notifications to show. */
  notify: NotifySettings
  /** Livery Studio: which engine (Claude / MiniMax) runs which task, and the render pre-check. */
  ai: AiSettings
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

/** A user-saved AI-invented concept (see CONCEPT_SYSTEM) — a small curated
 *  library separate from the learned playbook, so a good one-off invention
 *  can be reused as if it were a regular Scenario (id becomes `concept:<id>`). */
export interface SavedConcept {
  id: number
  label: string
  brief: string
  createdAt: string
  /** id of the Entry this was promoted from, for traceability. */
  sourceEntryId?: number
}

// --- Livery Studio: render pipeline ---------------------------------------------

export interface RenderSettings {
  /** Max renders SENT to Dola per local calendar day. Jobs past the cap wait for tomorrow. */
  dailyCap: number
  /** Max renders running at once. 0 = one per free Dola instance. */
  maxParallel: number
  /** DolaMultiBrowser instance ids never used for automatic rendering (reserved for other work). */
  excludeInstances: number[]
  /** Folder the watermark-free MP4s (+ a .json sidecar) are saved into. */
  outputDir: string
  /** Settings lines typed above the prompt in Dola's Generate Videos skill. */
  model: string
  duration: string
  aspect: string
  /** Standing instructions typed between the settings block and the prompt (blank = none). */
  extraInstructions: string
  /** Ask Dola to search for reference images itself (block sent after the instructions). Default for every render; each render can override. */
  referenceImages: boolean
  /** Image 1 line; {aircraft} is replaced with the aircraft the prompt names. */
  referenceImage1: string
  /** Optional Image 2 line per scenario id (incl. 'concept:<id>'), e.g. a prop the concept needs. */
  referenceImage2: Record<string, string>
  /** How long to wait for Dola to finish one video after it starts. */
  waitMinutes: number
  /** Start a stopped instance when no running one is free. */
  autoStartInstances: boolean
  /** Queue a render automatically for every newly generated prompt. */
  autoRender: boolean
  /** Pause sending after this many renders in a row fail on the Dola page itself (0 = never). */
  pauseAfterFailures: number
  /** Local hour (0–23) when Dola's daily video credits come back; out-of-credit accounts rest until then. */
  creditResetHour: number
}

export type RenderStatus = 'queued' | 'starting' | 'sending' | 'generating' | 'downloading' | 'done' | 'failed' | 'cancelled'

/** One prompt -> video job. Lives in renders.json (main-owned), linked to its Entry by entryId. */
export interface RenderJob {
  id: string
  entryId: number
  /** Snapshot of the prompt/title at submit time — the entry can change later. */
  prompt: string
  /** Additional instructions sent above the prompt — captured when the job is sent to Dola. */
  instructions?: string
  /** Per-render override of Settings → Render → reference images (undefined = use the setting). */
  useReferences?: boolean
  /** Aircraft named by the prompt, looked up once for Image 1 ('' = none found). Reused by later takes. */
  refAircraft?: string
  /** The reference-images block actually sent (captured at send time). */
  references?: string
  title: string
  filename: string
  status: RenderStatus
  /** Human-readable detail for the current status (why it's waiting, last error…). */
  note?: string
  error?: string
  attempts: number
  /** Instance ids already tried and abandoned for this job (busy / failed). */
  tried: number[]
  instanceId?: number
  instanceName?: string
  /** Dola conversation URL once sent — lets an interrupted job resume waiting instead of re-sending. */
  chatUrl?: string
  file?: string
  width?: number
  height?: number
  bytes?: number
  createdAt: string
  /** When the prompt was actually sent to Dola — this is what counts toward the daily cap. */
  sentAt?: string
  endedAt?: string
  /** Your verdict on the rendered video (absent = awaiting review). */
  review?: JobReview
  /** Set when the Studio queued this job by itself after every take of the prompt was rejected. */
  auto?: 'rerender' | 'rewrite'
  /** AI pre-check of the rendered video (MiniMax, video input). Advisory only. */
  precheck?: PreCheck
}

/** 'skipped' = out of the review queue without a verdict (e.g. couldn't post it): file stays put, no learning. */
export type ReviewVerdict = 'approved' | 'rejected' | 'skipped'

export interface JobReview {
  verdict: ReviewVerdict
  reasons: string[]
  comment: string
  at: string
}

/** What to do when every rendered take of a prompt has been rejected. */
export type AllRejectedAction = 'ask' | 'rerender' | 'rewrite'

/**
 * Engine for one task: 'claude:generation' (the generation model in Settings),
 * 'claude:<model id>', or 'minimax:<model id>'.
 */
export type EngineRoute = string

export interface AiSettings {
  minimax: {
    /** Allow the Studio to call MiniMax Code (mcode) at all. */
    enabled: boolean
    /** Path to mcode's cli.js; blank = the npm global install. */
    cliPath: string
    /** Stop calling MiniMax for the day after this many tokens (0 = no limit). Protects plan quota and credits. */
    dailyTokenLimit: number
  }
  /** Which engine writes titles, captions, coverage notes and reference-image names. Generation + learning use generationModel / learningModel. */
  routes: { title: EngineRoute; caption: EngineRoute; scene: EngineRoute; refAircraft: EngineRoute }
  precheck: {
    /** Let a MiniMax video model watch each finished render and suggest approve/reject. */
    enabled: boolean
    /** MiniMax model with video input, e.g. MiniMax-M3. */
    model: string
    /** Run automatically when a render finishes (otherwise only from the Review button). */
    auto: boolean
  }
}

export interface PreCheck {
  status: 'running' | 'done' | 'failed'
  verdict?: 'approve' | 'reject'
  /** 0–1: how sure the model is of its verdict. */
  confidence?: number
  /** Reject-reason ids (same list as Review). */
  reasons?: string[]
  notes?: string
  model?: string
  error?: string
  at: string
}

export interface NotifySettings {
  /** Master switch. */
  enabled: boolean
  /** Only when the Studio window isn't the one you're looking at. */
  onlyWhenUnfocused: boolean
  /** A render finished and is waiting for review. */
  renderDone: boolean
  /** A render failed. */
  renderFailed: boolean
  /** Today's render cap is used up. */
  capReached: boolean
  /** Sending was paused because Dola's page looks different (several page failures in a row). */
  queuePaused: boolean
  /** The Studio re-rendered or rewrote a prompt by itself after every take was rejected. */
  autoRetry: boolean
  /** Every usable Dola account is out of video credits for today. */
  creditsOut: boolean
}

/** Why sending to Dola is paused (null/absent = running). */
export interface QueuePause {
  reason: string
  at: string
  /** true = paused automatically by the Dola page guard; false = paused by you. */
  auto: boolean
}

export interface ReviewSettings {
  /** After each rejection, one Claude call folds the reasons into the render-lessons memory. */
  learnFromRejections: boolean
  /** Add the render lessons to every new prompt the brain writes. */
  useLessons: boolean
  /** Size budget for the render-lessons memory (characters). */
  lessonsBudget: number
  onAllRejected: AllRejectedAction
  /** Automatic retries per prompt when onAllRejected is not 'ask'. */
  maxAutoRetries: number
}

export interface DolaInstanceInfo {
  id: number
  name: string
  kind: string
  status: string
  isInitialized: boolean
  excluded: boolean
  busy: boolean
  cooldownUntil?: number
  /** Out of Dola video credits until this time (ms). */
  creditsOutUntil?: number
  /** From Dola's message: credits one render needs / credits the account had left. */
  creditsNeed?: number
  creditsLeft?: number
}

export interface RenderOverview {
  /** Set while sending is paused (by you or by the Dola page guard). */
  paused?: QueuePause | null
  jobs: RenderJob[]
  sentToday: number
  dailyCap: number
  /** null when DolaMultiBrowser's Control API is unreachable; error explains why. */
  instances: DolaInstanceInfo[] | null
  error?: string
}

/** Usage meter: totals for one key (a call label, a model, or a day). */
/** Which engine a usage row / task ran on. */
export type Provider = 'claude' | 'minimax'

export interface UsageRow { provider?: Provider; key: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number; cacheTokens: number }
