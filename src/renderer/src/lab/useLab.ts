// Lab state + actions. Called by App (not by the Lab screen) so everything here survives
// switching screens, exactly as when it lived in App.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { SCENARIOS, pickRandomScenario } from '@shared/domain'
import { toFilename, splitSections, parseViews } from '@shared/util'
import { topInsights } from '@shared/brain'
import type { AppConfig, Entry, ReachId, Scenario, SavedConcept } from '@shared/types'

export function useLab({ config, history, persist, setPlaybook }: {
  config: AppConfig | null
  history: Entry[]
  persist: (updater: (prev: Entry[]) => Entry[]) => void
  setPlaybook: (text: string) => void
}) {
  const [scenario, setScenario] = useState('random')
  const [aircraft, setAircraft] = useState('placeholder')
  const [crowd, setCrowd] = useState('busy')
  const [env, setEnv] = useState('auto')
  const [camera, setCamera] = useState('auto')
  const [hook, setHook] = useState(false)
  const [multiShot, setMultiShot] = useState(false)
  const [punchyOpen, setPunchyOpen] = useState(false)
  const [region, setRegion] = useState('any')
  const [varyCoverage, setVaryCoverage] = useState(false)
  const [useTrends, setUseTrends] = useState(false)
  const [boost, setBoost] = useState(false)
  const [longPrompt, setLongPrompt] = useState(true)
  const [candidateMode, setCandidateMode] = useState(false)
  const [candidates, setCandidates] = useState<Entry[]>([])
  const [nudge, setNudge] = useState('')
  const [explore, setExplore] = useState(45)

  const [savedConcepts, setSavedConcepts] = useState<SavedConcept[]>([])
  const [conceptLoading, setConceptLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  // How many learn tasks are running in the background (a counter, not a flag,
  // so overlapping submits don't switch the indicator off too early).
  const [learnCount, setLearnCount] = useState(0)
  const learning = learnCount > 0
  const [error, setError] = useState('')
  const [current, setCurrent] = useState<Entry | null>(null)
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [reachDraft, setReachDraft] = useState<ReachId | null>(null)
  const [viewsDraft, setViewsDraft] = useState('')
  const [excludeCoverage, setExcludeCoverage] = useState(false)
  const [toast, setToast] = useState('')
  const [captioning, setCaptioning] = useState(false)
  const [showLearn, setShowLearn] = useState(false)

  // A small, self-clearing confirmation line (quiet — no modal).
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }, [])


  // Lever defaults from Settings, applied once when the config first arrives (as before).
  const appliedDefaults = useRef(false)
  useEffect(() => {
    const cfg = config
    if (!cfg || appliedDefaults.current) return
    appliedDefaults.current = true
    setScenario(cfg.defaults.scenario); setAircraft(cfg.defaults.aircraft); setCrowd(cfg.defaults.crowd)
    setEnv(cfg.defaults.env); setCamera(cfg.defaults.camera || 'auto')
    setExplore(cfg.defaults.explore); setHook(cfg.defaults.hook); setMultiShot(cfg.defaults.multiShot); setLongPrompt(cfg.defaults.longPrompt !== false)
  }, [config])
  useEffect(() => {
    if (typeof window.api?.getSavedConcepts === 'function') window.api.getSavedConcepts().then(setSavedConcepts).catch(() => { /* ignore */ })
  }, [])

  const brainInsights = useMemo(() => topInsights(history), [history])


  const rated = history.filter((h) => h.status === 'scored' && h.reach)
  const tierCount = (id: ReachId) => rated.filter((h) => h.reach === id).length
  const hookTries = rated.filter((h) => h.hook)
  const hookStrong = hookTries.filter((h) => h.reach === 'viral' || h.reach === 'good')

  const toscoreCount = history.filter((h) => h.status === 'queued' || h.status === 'posted').length


  // Runs the learn step in the background — the caller does NOT await this, so
  // the user can keep scoring, opening entries, or generating while the playbook
  // distils. Backend serialises CLI calls (exclusive chain), so overlapping
  // learns queue safely and each sees the previous result.
  async function doLearn(entry: Entry) {
    if (!config?.autoLearn) { flashToast('Result saved ✓'); return }
    setLearnCount((n) => n + 1)
    try {
      const { playbook: pb } = await window.api.learn(entry)
      setPlaybook(pb)
      flashToast('Playbook updated ✓')
    } catch {
      flashToast('Saved — learning step failed')
    } finally { setLearnCount((n) => Math.max(0, n - 1)) }
  }

  // Entry factory from the current lever state — shared by generate and remix.
  function buildEntry(resolved: Scenario, res: { text: string; title: string; filename: string }, extra: Partial<Entry> = {}): Entry {
    return {
      id: Date.now(), text: res.text, title: res.title, filename: res.filename,
      scenario: resolved.label, scenarioId: resolved.id, aircraft, pickedAircraft: '', pickedEnv: '', crowd, env, camera, hook, multiShot, punchyOpen,
      // ramp_glide skips the boost block (its biases fight the locked scene), so
      // record the EFFECTIVE boost — keeps the A/B win-rate data unpolluted.
      tier1Only: region === 'tier1', region, useTrends, nudge: nudge.trim(), boost: boost && resolved.id !== 'ramp_glide', longPrompt,
      status: 'queued', postedAt: null, reach: null, tags: [], comment: '', ts: new Date().toISOString(),
      ...extra,
    }
  }

  function buildReq(resolved: Scenario) {
    return { resolved, aircraft, crowd, env, camera, hook, multiShot, punchyOpen, tier1Only: region === 'tier1', region, varyCoverage, useTrends, explore, nudge, boost, longPrompt }
  }

  function resetScoringDraft() {
    setError(''); setLoading(true); setPickedTags([]); setComment(''); setReachDraft(null); setExcludeCoverage(false); setViewsDraft(''); setCandidates([])
  }

  // Clears whatever is currently open — a fresh generation or one pulled up
  // from History — including the scoring draft and the nudge openEntry copies
  // in, so a stale "Direction" from a history entry can't silently ride along
  // into the next generation.
  function startNew() {
    setError(''); setCurrent(null); setCandidates([]); setPickedTags([]); setComment(''); setReachDraft(null); setExcludeCoverage(false); setViewsDraft(''); setNudge('')
  }

  // A saved concept behaves exactly like a fixed Scenario once resolved — same
  // id shape ('concept:<id>') an entry generated from it would carry, so
  // future generations/remixes/stats all attribute back to this one id.
  function conceptScenario(c: SavedConcept): Scenario {
    return { id: `concept:${c.id}`, label: c.label, group: 'AI Concepts', brief: c.brief }
  }

  function resolveScenario(id: string): Scenario | undefined {
    return SCENARIOS.find((s) => s.id === id) || (() => {
      const saved = savedConcepts.find((c) => `concept:${c.id}` === id)
      return saved ? conceptScenario(saved) : undefined
    })()
  }

  // Settings → Render → "Auto-render new prompts". The history write is async
  // (persist → IPC), so give it a beat to land before main looks the entry up.
  function autoRender(entry: Entry) {
    if (!config?.render?.autoRender) return
    setTimeout(() => { window.api.renderSubmit([entry.id]).catch(() => flashToast('Auto-render failed to queue — use 🎬 Render')) }, 400)
  }

  // Shared by the scenario-select path, the Random pick, and the AI concept
  // path — all three just need a resolved Scenario to run the same request.
  async function generateFrom(resolved: Scenario) {
    if (loading) return
    resetScoringDraft()
    const req = buildReq(resolved)
    // AI concepts have no static home to look their brief up from later
    // (unlike fixed scenarios, which stay in SCENARIOS by id) — stash it here.
    const extra: Partial<Entry> = resolved.id.startsWith('concept:') ? { conceptBrief: resolved.brief } : {}
    try {
      if (candidateMode) {
        // ONE CLI call returns all candidates (separated server-side); titles
        // are deferred — only the chosen one gets a title in chooseCandidate.
        const results = await window.api.generateBatch({ ...req, skipTitle: true, candidates: 3 })
        if (!results.length) throw new Error('Candidate generation failed.')
        setCandidates(results.map((r, i) => ({ ...buildEntry(resolved, r, extra), id: Date.now() + i })))
      } else {
        const entry = buildEntry(resolved, await window.api.generate(req), extra)
        setCurrent(entry); persist((prev) => [entry, ...prev])
        autoRender(entry)
      }
    } catch (e: any) {
      setError(e?.message || 'Could not reach the model. Check Settings → Test connection.')
    } finally { setLoading(false) }
  }

  async function generate() {
    // Weighted pick: proven-viral scenarios (weight > 1) come up more often,
    // further steered by actual win-rate history and the Exploration slider.
    const resolved = scenario === 'random' ? pickRandomScenario(history, explore) : resolveScenario(scenario)
    if (!resolved) return
    await generateFrom(resolved)
  }

  // Ask the model to invent a brand-new one-off concept, then generate from
  // it immediately — a separate loading flag so this button's own busy state
  // doesn't fight the main "Generate prompt" button's.
  async function surpriseConcept() {
    if (loading || conceptLoading) return
    setConceptLoading(true)
    try {
      const { label, brief } = await window.api.suggestConcept()
      await generateFrom({ id: `concept:${Date.now()}`, label, group: 'AI Concepts', brief })
    } catch (e: any) {
      setError(e?.message || 'Could not invent a concept. Check Settings → Test connection.')
    } finally {
      setConceptLoading(false)
    }
  }

  // Promote a one-off AI concept into the saved library so it can be picked
  // from the Scenario dropdown and reused later — then re-tag this entry to
  // the saved concept's stable id so future stats/coverage attribute to it
  // consistently instead of the ephemeral one-off id it was generated under.
  async function saveThisConcept(entry: Entry) {
    if (!entry.scenarioId?.startsWith('concept:')) return
    const saved = await window.api.saveConcept({ label: entry.scenario, brief: entry.conceptBrief || '', sourceEntryId: entry.id })
    setSavedConcepts((prev) => [saved, ...prev])
    const stableId = `concept:${saved.id}`
    if (entry.scenarioId !== stableId) updateEntry({ scenarioId: stableId })
    flashToast('Concept saved ✓')
  }

  // Double down on a proven winner: fresh prompt that keeps its winning
  // ingredients but changes aircraft/setting so it never reads as a repost.
  async function remixWinner(source: Entry) {
    if (loading) return
    resetScoringDraft()
    const resolved = SCENARIOS.find((s) => s.id === source.scenarioId)
      || (source.scenarioId?.startsWith('concept:') ? { id: source.scenarioId, label: source.scenario, group: 'AI Concepts', brief: source.conceptBrief || '' } : undefined)
      || pickRandomScenario(history, explore)
    try {
      const res = await window.api.generate({ ...buildReq(resolved), remixText: source.text })
      const entry = buildEntry(resolved, res, { remixOf: source.id, conceptBrief: source.conceptBrief })
      setCurrent(entry); persist((prev) => [entry, ...prev])
      autoRender(entry)
      flashToast('Remix ready ✓')
    } catch (e: any) {
      setError(e?.message || 'Could not reach the model. Check Settings → Test connection.')
    } finally { setLoading(false) }
  }

  async function chooseCandidate(entry: Entry) {
    setCandidates([]); setCurrent(entry); persist((prev) => [entry, ...prev])
    // Candidate generations skip the title step; write one now for the winner.
    if (config?.titleEnabled && !entry.title) {
      try {
        const t = await window.api.title({ text: entry.text, avoid: titleAvoidList() })
        const withTitle: Entry = { ...entry, title: t, filename: toFilename(t || entry.scenario, SCENARIOS.find((s) => s.id === entry.scenarioId)?.filenamePrefix) }
        setCurrent((c) => (c && c.id === entry.id ? withTitle : c))
        persist((prev) => prev.map((h) => (h.id === entry.id ? withTitle : h)))
      } catch { /* keep it untitled — "New title" can retry */ }
    }
    autoRender(entry)
  }

  // Ctrl/Cmd+Enter generates from anywhere. A ref keeps the handler pointed at
  // the latest closure (current lever state) without re-binding the listener.
  const generateRef = useRef(generate)
  generateRef.current = generate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generateRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openEntry(h: Entry) { setCurrent(h); setPickedTags(h.tags || []); setComment(h.comment || ''); setReachDraft(h.reach || null); setExcludeCoverage(!!h.excludeCoverage); setViewsDraft(typeof h.views === 'number' ? String(h.views) : ''); setNudge(h.nudge || '') }

  // Save without learning — used for posted / skipped / restore.
  function updateEntry(patch: Partial<Entry>) {
    if (!current) return
    const updated: Entry = { ...current, comment: comment.trim(), tags: pickedTags, ...patch }
    setCurrent(updated)
    persist((prev) => prev.map((h) => (h.id === current.id ? updated : h)))
  }

  // The explicit submit: commit the full draft (tier + comment + flags) once,
  // then run learning on the complete feedback — never mid-typing.
  async function submitScore() {
    if (!current || !reachDraft) return
    const excl = excludeCoverage
    const updated: Entry = { ...current, comment: comment.trim(), tags: pickedTags, reach: reachDraft, status: 'scored', excludeCoverage: excl, views: parseViews(viewsDraft) }
    setCurrent(updated)
    persist((prev) => prev.map((h) => (h.id === current.id ? updated : h)))
    // Immediate confirmation, then learning runs in the background (not awaited)
    // so you can keep working straight away.
    if (config.autoLearn) flashToast('Saved ✓ — teaching the playbook in the background')
    doLearn(updated)
    // Record coverage (aircraft + setting) for any clip the user kept (checkbox on).
    // Skip if already captured (pickedEnv present) or opted out via the checkbox.
    if (!excl && !updated.pickedEnv) {
      try {
        const scene = await window.api.identifyScene(updated.text)
        if (scene && (scene.aircraft || scene.environment)) {
          const withScene: Entry = { ...updated, pickedAircraft: updated.pickedAircraft || scene.aircraft || '', pickedEnv: scene.environment || '' }
          setCurrent((c) => (c && c.id === withScene.id ? withScene : c))
          persist((prev) => prev.map((h) => (h.id === withScene.id ? withScene : h)))
        }
      } catch { /* best-effort — coverage just won't record this one */ }
    }
  }

  function patchCurrent(patch: Partial<Entry>) {
    if (!current) return
    const updated = { ...current, ...patch }
    setCurrent(updated)
    persist((prev) => prev.map((h) => (h.id === current.id ? updated : h)))
  }

  function titleAvoidList(extra?: string) {
    const arr = history.filter((h) => h.title && h.title.trim()).map((h) => h.title.trim())
    if (extra) arr.push(extra)
    return [...new Set(arr)].slice(0, 8)
  }

  async function regenerateTitle() {
    if (!current) return
    try {
      const t = await window.api.title({ text: current.text, avoid: titleAvoidList(current.title) })
      patchCurrent({ title: t, filename: toFilename(t || current.scenario, SCENARIOS.find((s) => s.id === current.scenarioId)?.filenamePrefix) })
    } catch { /* ignore */ }
  }

  async function writeCaption() {
    if (!current || captioning) return
    setCaptioning(true)
    try {
      const c = await window.api.caption({ text: current.text, title: current.title || '' })
      if (c) patchCurrent({ caption: c })
    } catch { flashToast('Caption step failed — try again') } finally { setCaptioning(false) }
  }


  const count = current ? current.text.length : 0
  const charLimit = config?.charLimit ?? 1500
  const over = count > charLimit
  const sections = current ? splitSections(current.text) : null
  const cur = current ? history.find((h) => h.id === current.id) || current : null


  return { scenario, setScenario, aircraft, setAircraft, crowd, setCrowd, env, setEnv, camera, setCamera, hook, setHook, multiShot, setMultiShot, punchyOpen, setPunchyOpen, region, setRegion, varyCoverage, setVaryCoverage, useTrends, setUseTrends, boost, setBoost, longPrompt, setLongPrompt, candidateMode, setCandidateMode, candidates, setCandidates, nudge, setNudge, explore, setExplore, savedConcepts, setSavedConcepts, conceptLoading, setConceptLoading, loading, setLoading, learnCount, setLearnCount, error, setError, current, setCurrent, pickedTags, setPickedTags, comment, setComment, reachDraft, setReachDraft, viewsDraft, setViewsDraft, excludeCoverage, setExcludeCoverage, toast, setToast, captioning, setCaptioning, showLearn, setShowLearn, learning, toastTimer, flashToast, brainInsights, rated, tierCount, hookTries, hookStrong, toscoreCount, generateRef, count, charLimit, over, sections, cur, doLearn, buildEntry, buildReq, resetScoringDraft, startNew, conceptScenario, resolveScenario, autoRender, generateFrom, generate, surpriseConcept, saveThisConcept, remixWinner, chooseCandidate, openEntry, updateEntry, submitScore, patchCurrent, titleAvoidList, regenerateTitle, writeCaption }
}

export type LabState = ReturnType<typeof useLab>
