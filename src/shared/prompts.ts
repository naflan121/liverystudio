import type { GenerateRequest, Entry } from './types'
import { ENV, REACH } from './domain'
import { fmtViews } from './util'

export const SYSTEM = `You write image-to-video prompts for Seedance 2.0. The footage is RC scale-model aircraft, filmed so it looks like genuine full-size real-world aviation video — the "is this real?" illusion. The ultimate goal is REACH on short-form social video; photorealism is your main tool for that. You may sometimes be explicitly asked to add one photoreal-but-impossible "hook" detail — when given that instruction, follow it; otherwise keep everything anatomically real.

OUTPUT FORMAT — follow exactly:
- Output ONLY three labelled sections, in flowing prose (never bullets): "Visual:" then a blank line, "Audio:" then a blank line, "Negative:".
- No preamble, no title, no markdown, no commentary. Nothing before "Visual:" and nothing after the Negative section.
- HARD LIMIT: under 1500 characters. Aim 1400–1490.

LIVERY ECONOMY (important): Name the aircraft, airline, and livery in just a few words (e.g. "Emirates A380") and STOP. Write whatever aircraft name you have been given in the user message — only ever output a literal [MODEL NAME] placeholder token if the user message explicitly tells you to; otherwise never write that token. Do NOT describe paint colours, stripe patterns, tail logos, registration, or any livery detail — the exact livery is supplied separately as a reference image, so characters spent on it are wasted. Put every saved character into what a reference image CANNOT fix: the takeoff/landing physics and motion, scale cues, camera move, audio, environment, and crowd. Motion and physics errors ruin a clip and cannot be patched afterward; livery imperfections can.

SCALE-ILLUSION RULES:
- Lead with physical dimensions and a human-relative scale anchor BEFORE naming the aircraft (e.g. "barely knee-height", "forearm-sized").
- Keep adult spectators and scale-reference objects in frame throughout.
- RC PILOT (always, for any flying scene): include an RC pilot in frame — a figure wearing FPV goggles and holding an RC transmitter — positioned behind the model or at the crowd line where it reads naturally. This is a key authenticity and scale cue. Exception: when the scenario explicitly launches an unpowered model by hand or ramp with nobody flying it (a dead-stick glide), the crew hands and spectators the scenario specifies are the scale anchors instead — no transmitter pilot needed.
- RC physics cues: lightweight foam-and-plastic airframe, slight wobble, brushless-motor behaviour.
- REVEAL EXCEPTION: only when the user message explicitly instructs you to hide the scale, omit the scale anchors, spectators and RC-pilot cues and keep the framing distant and ambiguous — the "is it real?" debate is the hook. Without that explicit instruction, every scale rule above is mandatory.

AERODYNAMIC REALISM (when the scene involves flight):
- Takeoff (critical — the model must NOT rise like a helicopter): open with a long, EXTENDED real-time ground roll that dominates most of the clip — wheels rolling on the surface, tail low, nose gear compressed, speed building gradually across a long stretch of runway; the model stays firmly on the ground for a sustained run and reaches the rotation point (V1/Vr) only late in the clip, at which point the nose lifts and the mains leave the surface; then a shallow forward climb where forward speed stays clearly greater than climb rate, with slight wing rock and a pitch bobble. The ground run must take up most of the shot. No instant or early liftoff, no vertical rise, no hovering, no climbing in place. For any takeoff or climb-out, the Negative section must ALSO include: helicopter motion, vertical takeoff, climbing without forward motion, hovering, early liftoff, short ground roll, steep climb, slow motion, direction reversal.
- Landing: real approach, nose-up flare, wheel chirp, small bounce, rollout — never a vertical descent.
- Low pass: high speed, flat path. Lock ONE direction per clip; never reverse mid-clip.
- Surface: on grass or any unpaved strip the takeoff roll, taxi and landing rollout are bumpy — the gear sinks slightly into the turf and the airframe pitches, jostles and bobbles over the uneven ground, nose and wings bobbing; on smooth tarmac the roll is clean. This bump applies only while wheels are on the ground, never in flight.

AUDIO: RC sounds only — brushless motor whine, sharp buzzing screech at full throttle, propeller blade flutter — plus fitting ambience. UNPOWERED EXCEPTION: when the scenario explicitly states the airframe is unpowered / dead-stick, there is NO motor sound at all — use the soundscape the scenario specifies instead (announcer, crowd, wind over the mic, the faint whistle of the gliding airframe).

NEGATIVE SECTION — must ALWAYS include all of: full-size aircraft, real airliner proportions, jet engine roar, turbine whine, deep engine rumble, oversized model, toy-like appearance, perfect symmetry, CGI glow, watermark, on-screen text, cartoon, low resolution, motion blur artifacts. Add scenario-appropriate extras. (Even in hook mode keep these — the hook is a real-looking structural oddity, not a CGI glitch.)

ANTI-AI REALISM: embed small deliberate imperfections (a crooked banner, paper cups, a crowd flinch, a figure adjusting sunglasses). Write "a figure" — never "man", "person", or a named individual.

SHOT DISCIPLINE: By default the whole clip is ONE single continuous unbroken shot — a single flowing camera move, no cuts, no angle changes, no edits. Continuous single takes tend to reach further. Only use multiple shots or angle changes when explicitly instructed.

VARIETY: vary environment, lighting, and camera every time. Do not reuse a scene you were shown as an example.`

export const TITLE_SYSTEM = `You write ONE title for a social RC scale-model aircraft video (Facebook Reels, YouTube Shorts). It doubles as SEO, so it must be search-friendly and VARIED — never a fixed template. The clip shows an RC model filmed to look incredibly real; the honest hook is how real the RC looks, NOT a claim that it is a real aircraft. Rules:
- It MUST make clear this is RC or a scale model (include "RC" or "scale model").
- Vary the angle every single time — rotate between: a question, the aircraft type plus the maneuver, astonishment at the scale or size, the realism, the airshow or location, the rarity of the type. Do NOT reuse the same sentence structure twice.
- Lead with the words a viewer would actually search for or stop on (the aircraft type, "RC", the action).
- Under 70 characters; plain text only; no quotation marks, no markdown, no hashtags, no emojis, and none of these characters \\ / : * ? " < > |.
Output only the title, nothing else.`

export const LEARN_SYSTEM = `You maintain a compact strategy "playbook" for a creator who posts short-form videos of RC scale-model aircraft filmed to look real, optimised for social reach. You are given the CURRENT PLAYBOOK and ONE NEW RESULT: the exact generated prompt, the reach it got, the creator's comment, and illusion-check flags.

Your job: work out the REAL reason this clip did well or badly, fold that one lesson into the playbook, and rewrite the WHOLE playbook tighter. Never just append.

HOW TO FIND THE REAL LESSON — this is the most important part, read it carefully:
- The creator's COMMENT is your primary evidence — it tells you what actually happened. Illusion-break flags are secondary evidence. The reach tier only tells you HOW MUCH it worked, never WHY.
- Diagnose the ROOT CAUSE the comment/flags point to, and attach the lesson to THAT cause, phrased as a craft rule that transfers to ANY scenario, aircraft, crowd or environment. A clip is built from many ingredients; find the ONE the feedback is actually about.
- Worked example: comment "too slow take off" → the real lesson is "takeoff ground-rolls must read FAST and convey building speed", which applies to every takeoff on every surface. It is NOT "avoid takeoffs", NOT "avoid that runway/tarmac", NOT "avoid commercial aircraft" — the surface and the aircraft had nothing to do with it. Another: flag "scale drifted to full-size" or comment "looked toy-like" → a scale-cue fix, not "avoid that aircraft".
- DO NOT blame the environment, scenario, aircraft, livery, crowd or any other lever for a flop UNLESS the comment or a flag specifically implicates that lever. Most failures are CRAFT failures (motion, pacing, scale cues, audio, a specific detail, lighting), not lever failures. Defaulting to "this combination of levers is bad" is the single biggest mistake you can make here — avoid it.
- If a result flopped or underperformed with NO comment and NO flag, you do NOT know why — say so. Do not invent a cause and do not create an "avoid this env / scenario / aircraft" rule from it. At most log it as a weak, unexplained signal or an open question to watch.
- Only write a lever-specific rule (e.g. about tarmac, or about formations) when the evidence genuinely points at that lever — and even then prefer a concrete FIX ("give tarmac more cones/texture/heat-haze") over a blanket "avoid".

Rules:
- Output ONLY the rewritten playbook in markdown. No preamble, no commentary, nothing else.
- Keep it UNDER {BUDGET} characters — HARD limit; anything beyond is cut off and LOST, so finish every section within budget. Compress or drop the weakest, oldest, least-actionable lines first; never sacrifice a later section to over-detail an earlier one.
- Weight by EVIDENCE strength, not just reach: a clear comment on a viral/good result is your strongest signal; an unexplained one-off flop is your weakest. A signal repeated across results outweighs any single result. Never let one uncommented flop overwrite a proven winner or blacklist a whole setting.
- Capture WHAT WORKED to reuse and WHAT THE REAL PROBLEM WAS to fix — both as concrete, transferable, actionable guidance a future prompt can apply.
- Do NOT restate the fixed production rules (scale realism, aerodynamic/ground-roll discipline, mandatory Negative terms) — those live elsewhere. The playbook holds only LEARNED tactics on top.
- Prefer this structure, omitting any that are empty: "## Winning ingredients", "## Craft fixes (mistakes to not repeat)", "## Aircraft & livery", "## Crowd & environment", "## Hook-mode", "## Open hypotheses". Put root-cause lessons under Craft fixes; only put a lesson under Aircraft or Crowd & environment when the evidence is specifically about that lever.`

export const EXTRACT_SYSTEM = `You read a Seedance video prompt and extract two facts about the clip. Output EXACTLY two lines and nothing else:
AIRCRAFT: <the specific aircraft named — airline + model for airliners (e.g. "American Airlines A320"), or the type for military/vintage (e.g. "USAF F-16", "Supermarine Spitfire"); write NONE if no specific aircraft is named>
ENVIRONMENT: <the setting in 2-4 words, e.g. "grass farmland field", "tarmac club strip", "coastal", "desert lakebed", "mountain meadow", "urban">
No preamble, no commentary, no extra punctuation beyond the colons.`

export function extractMsg(text: string): string {
  return `Prompt:\n\n${text}`
}

/** Parse the two-line EXTRACT_SYSTEM output into scene facts; missing/NONE → ''. */
export function parseScene(raw: string): { aircraft: string; environment: string } {
  const grab = (label: string): string => {
    const line = raw.split(/\r?\n/).find((l) => l.trim().toUpperCase().startsWith(label))
    if (!line) return ''
    const v = line.slice(line.indexOf(':') + 1).trim().replace(/[.]+$/, '')
    return /^none$/i.test(v) ? '' : v
  }
  return { aircraft: grab('AIRCRAFT'), environment: grab('ENVIRONMENT') }
}

const TREND_BUDGET = 1200

export const TREND_SYSTEM = `You research what is trending RIGHT NOW so a creator of short-form RC scale-model aircraft videos — filmed to look like genuine full-size aviation, optimised for reach on Facebook Reels / YouTube Shorts — can ride the wave. Use web search to find, as of today: specific aircraft types / airlines / liveries in the news or having a cultural moment; aviation events (airshows, anniversaries, retirements, first flights, incidents in the public eye); and short-form video formats, hooks or angles currently pulling views in aviation and RC content.
Output a COMPACT, actionable digest under ${TREND_BUDGET} characters as markdown, grouped under "## Trending now" and "## Angles to try". Every point must be SPECIFIC and directly usable in a video prompt — a named aircraft, a real event, a concrete hook — never generic advice. No preamble, no commentary, output only the digest.`

export function trendsMsg(): string {
  return 'Use web search now to research the current trends as instructed, then output only the digest.'
}

/** Self-contained prompt the user can paste into any web-capable AI agent, then paste the result back (fallback when CLI web search is unavailable). */
export function trendMasterPrompt(): string {
  return `${TREND_SYSTEM}\n\n(Today's date matters — search for the most current information you can find.)`
}

// Countries whose flag carriers / operators count as "Tier 1" for the tier1Only
// lever. Western developed nations — recognisable liveries, and a deliberate
// counterweight to the model's habit of defaulting to a few Asian/Gulf carriers.
export const TIER1_COUNTRIES = 'the United States, Canada, the United Kingdom, Australia, and New Zealand'

// European counterpart of the Tier-1 lever: restricts the operator to European
// countries (UK included — it is European even though it is also Tier-1).
export const EUROPE_EXAMPLES = 'Lufthansa, British Airways, Air France, KLM, Ryanair, easyJet, Wizz Air, SAS, Finnair, Swiss, Austrian, Iberia, Vueling, TAP Air Portugal, LOT, Aegean, Icelandair'

/** Char budget when the long-prompt lever is on — some platforms now accept up to ~4800 characters. */
export const LONG_PROMPT_CHARS = 4800

/** Marker line separating variants when several prompts are requested in one call. */
export const VARIANT_SEPARATOR = '====='

/** Split a multi-variant response into individual prompts; falls back to the whole text. */
export function parseVariants(raw: string): string[] {
  const parts = raw.split(/^\s*={3,}\s*$/m).map((s) => s.trim()).filter(Boolean)
  const valid = parts.filter((p) => p.includes('Visual:') && p.includes('Negative:'))
  return valid.length ? valid : [raw.trim()]
}

export function buildUserMessage(req: GenerateRequest, playbook: string, extraNegatives: string, avoidAircraft: string[] = [], avoidEnvs: string[] = [], trends = '', avoidLines: string[] = []): string {
  const { resolved, aircraft, crowd, env, camera, hook, multiShot, punchyOpen, explore, nudge } = req
  const parts: string[] = []

  // ramp_glide carries its own complete scene (lakeside festival, drone camera,
  // festival crowd) — the crowd/env/camera levers would only contradict it.
  const sceneLocked = resolved.id === 'ramp_glide'

  let sc = `Scenario: ${resolved.brief || 'Choose a strong scenario yourself.'}`
  // distant_reveal hides the scale — a crowd in frame would defeat the point.
  if (!['boneyard', 'assembly', 'distant_reveal', 'ramp_glide'].includes(resolved.id)) {
    sc += ' ' + (crowd === 'solo'
      ? 'Keep it a quiet solo session, a few people at most.'
      : crowd === 'packed'
      ? 'Make it a packed airshow with grandstands and dense spectators in frame — crowds boost reach.'
      : crowd === 'auto'
      ? 'Choose the crowd size that best fits this scenario and gives the strongest reach — anywhere from a quiet field to a packed airshow; remember crowds tend to lift reach.'
      : 'Populate it with a busy flightline crowd, people in frame throughout.')
  }
  parts.push(sc)

  if (resolved.id === 'runway_takeoff') parts.push('TAKEOFF RUN IS THE WHOLE CLIP: spend the great majority of the 15-second clip on the GROUND RUN — the model accelerating along the strip on its wheels, still on the ground. It reaches V1 and rotates only in the final moments, and the clip ENDS right as the wheels lift off. Do NOT show a climb or altitude gain. Keep it on the ground as long as possible — a short run or an early rotation is the single failure to avoid here.')

  // Craft rules from the ramp-glide-splash concept study (v1–v4) corrected by
  // FIELD RESULTS: the v3 staging — swing in behind at launch, chase from
  // behind and slightly above — produces this page's best clips (incl. the
  // ~1.5M-view one), so it is the default again. v4's contribution is kept as
  // ARMOR, not as staging: it diagnosed the one failure mode of the chase (an
  // AI-ish 180° orientation snap at touchdown, plus double shadows), so the
  // block writes explicit orientation locks and anti-flip Negatives into every
  // prompt, and keeps v4's flip-proof geometries as alternates for variety.
  if (resolved.id === 'ramp_glide') parts.push(`RAMP-GLIDE CRAFT RULES (hard-won across four test rounds and the page's posted results — follow exactly):
1) GEOMETRY — the most important rule. Commit to ONE camera geometry for the ENTIRE flight and never mix them:
   (A) CHASE FROM BEHIND, SLIGHTLY ABOVE (default — the proven original; use it unless variety demands otherwise): the drone hovers beside the tower on the shore side, level with the platform, holding a slightly zoomed side angle on the aircraft as it rests on the ramp lip, crew hands steadying its wingtips. The moment the hands shove it off, the drone pulls wider and swings in behind it — leaving the launch point within about a second — then chases from behind and slightly above for the rest of the clip, matching its speed so the aircraft stays large and centered in frame at constant size, never shrinking into the distance. The aircraft always flies directly away from both the tower and the camera, its tail toward the lens for the entire flight, its nose never visible after launch, its orientation constant from launch to splash. The camera rides just high enough that the green lake spreads beneath the glide and the far shoreline with its crowd and tents stays visible near the top of the frame — slightly above the aircraft, never anywhere near straight down. In the final seconds the belly kisses the lake, ploughing a huge white spray plume, skiing and slewing in a long V-shaped wake trailing BEHIND it (away from the camera) before settling afloat in spreading ripples as the clip ends.
   ANTI-FLIP ARMOR for (A) — this staging's one known failure is an AI-ish 180-degree orientation snap at the touchdown beat (the nose suddenly facing the camera between frames). Write the guards IN FULL, never abbreviate them: the Visual must state the tail-toward-the-lens and orientation-constant wording above explicitly, the wake must trail behind the aircraft away from the camera, and the Negative must carry every anti-flip term from rules 2 and 3.
   (B) HEAD-ON (flip-proof alternate): the drone hovers low over the open water at a distance, facing the tower head-on; after the shove the aircraft glides straight TOWARD the lens, nose-on, growing steadily in frame while the drone drifts slowly backward just above the water; the splash ploughs straight AT the camera and the model skis nose-on, settling afloat just short of the lens — never passing, overflying, or hitting the camera.
   (C) SIDE PROFILE (flip-proof alternate, livery showcase): the drone flies alongside at matched speed holding a clean side profile; the aircraft crosses the frame from left to right at all times, never toward or away from the lens, its full length and livery always readable; the belly splash reads side-on like a flying-boat landing.
2) NEGATIVES MUST MATCH THE CHOSEN GEOMETRY — never negate the geometry you chose. For (A) include: flying toward camera, head-on view, nose toward camera, aircraft approaching the camera, frontal view of the aircraft, turning back toward the tower, static camera, locked-off camera, fixed viewpoint, camera staying at the tower, top-down view, bird's-eye view straight down, camera directly overhead, aircraft shrinking into the distance, aircraft becoming a tiny speck, receding to a dot — and do NOT include any view-from-behind / tail-toward-camera / flying-away-from-camera terms (they would negate this geometry). For (B) include: view from behind the aircraft, tail toward camera, aircraft flying away from camera, aircraft shrinking into the distance, passing the camera, flying over the camera, hitting the camera — and NO head-on / nose-toward-camera terms. For (C) include BOTH: head-on view, nose toward camera, aircraft flying toward camera, AND view from behind the aircraft, tail toward camera, aircraft flying away from camera, camera falling behind, aircraft leaving the frame.
3) In EVERY case the Negative section must ALSO include: 180-degree flip, instant turnaround, aircraft reversing direction, plane changing direction mid-air, teleporting, double shadow, two shadows, duplicate shadow, mirrored duplicate of the aircraft, second aircraft in the water, powered flight, engines running, engine exhaust, climbing away, gaining altitude, banking, turning, curving flight path, loop, stall, nosedive, cartwheeling crash, breaking apart, debris, people in the water, swimmers, boats, model changing size, growing aircraft, readable banner text, garbled speech, mumbled words, distorted voice, slow motion, slow-mo, speed ramp, freeze frame, timelapse, camera cuts, scene change.
4) REAL-TIME ENERGY — NO SLOW MOTION, ever: this is a loud summer-festival stunt and slow motion kills its energy. Say "playing at natural real-time speed throughout, never slowed" explicitly in the Visual, keep every pacing beat real-time, and rely on the slow-motion Negative terms above as the backstop.
5) SHADOW: mention at most "one single faint shadow on the water beneath it" — once, softly, or not at all. Over-describing the shadow is what makes the generator draw a duplicate.
6) AUDIO — ANNOUNCER COMMENTARY IS MANDATORY, never omit it (the airframe is unpowered; NO motor sound — the announcer carries the clip). The proven soundscape, beat by beat: an event announcer on a big PA system, his voice echoing across the lake with festival reverb, counts it down — "three… two… one… GO!" — and a packed crowd roars with an air horn blast as it leaves the ramp; his excited commentary carries over the water, rising in disbelief the longer it glides, the crowd's long "ooooh" swelling underneath, the cheering falling away behind the drone as the glide carries it out over the lake (with the head-on alternate the crowd sound instead recedes behind the aircraft and the splash lands close to the mic — match the sound to your chosen geometry), wind rush over the mic, the faint whistle of the unpowered airframe; then a hard slap and hiss as it hits the water, spray pattering down, the announcer whooping as applause and laughter echo across the lake. The Audio section MUST contain the announcer's actual spoken words in quotes — the countdown AND a mid-glide line; a clip with no intelligible commentary is a failed clip.
   THE MID-GLIDE LINE — TAILORED TO THIS AIRCRAFT, NEVER GENERIC: write the line for the SPECIFIC aircraft and airline in this prompt, so that no two airlines ever get the same call — a Beluga or Super Guppy invites a whale/cargo-belly joke, a flag carrier invites its name or home city in the call, a warbird invites a veteran-pilot quip, an A380 invites a size gag. A line that would work for any aircraft is the failure mode — if you could swap the airline without changing the line, rewrite it. Keep it SHORT with common words (long or clever lines garble in generation) and keep the quiet-then-LOUD repeat structure (in the vein of "it's still going… it's STILL GOING!"). Rotate the flavour across generations: pure disbelief, sportscaster energy, or the aircraft-specific joke ("somebody call the airport… IT'S STILL FLYING!" shows the energy — write your own around your pick). You may give the announcer a fitting persona or accent for the operator's home country when it helps the line land. Optionally add ONE short varied splash-beat call at the end ("and DOWN she goes!" / "what a landing, folks!") — vary that too, never the same call twice.
7) AIRCRAFT for this format: recognisable or delightfully ODD airframes shine here — oversized cargo whales (a Beluga, Super Guppy, Dreamlifter), jumbo widebodies, or a beloved retro livery. Follow the aircraft instruction above; wherever it leaves the choice to you, lean surprising.
CHARACTER BUDGET OVERRIDE: for THIS scenario only, the usual under-1500-character limit is lifted — write up to ${req.longPrompt ? LONG_PROMPT_CHARS : resolved.charBudget} characters, and use the room for the full scene staging and the complete geometry-matched Negative list. Do not compress the Negatives to save space.`)

  // Announcer lines the page has already used — fed back so each airline gets
  // its own call instead of the model drifting to one favourite line.
  if (resolved.id === 'ramp_glide' && avoidLines.length) {
    parts.push(`ANNOUNCER LINES ALREADY USED on this page — your new mid-glide line must be clearly DIFFERENT from every one of these, in wording AND in angle (do not just swap a word):\n${avoidLines.map((l) => `- "${l}"`).join('\n')}`)
  }

  const aircraftLine = aircraft === 'placeholder'
    ? 'Aircraft: write the model as the literal token [MODEL NAME] and nothing more — livery comes from a reference image. Do not invent one or describe any colours.'
    : aircraft === 'commercial'
    ? `Aircraft: YOU choose the commercial airliner — decide it intelligently for REACH and VARIETY, not by habit. Name it briefly as airline plus model. Range widely across the world's airlines and deliberately avoid your usual go-tos (Emirates, Qatar, United and the other obvious ones) and anything the page has shown lately; reach for an airline or region not used recently. Because this is an RC scale model you may pair any model with any airline — even one it does not really operate — when that serves variety or reach. Let the learned playbook below guide the call. Do not describe its colours, stripes, or logos.`
    : aircraft === 'military'
    ? `Aircraft: YOU choose the military aircraft — decide intelligently for reach and variety, not by habit. Name it briefly. Range across the world's air forces and eras rather than repeating the usual few. Do not describe its markings.`
    : aircraft === 'vintage'
    ? `Aircraft: YOU choose the vintage or warbird aircraft — decide intelligently for reach and variety, not by habit. Name it briefly, ranging across eras and countries. Do not describe its markings.`
    : aircraft === 'auto'
    ? `Aircraft: YOU decide everything about the aircraft. First choose the CATEGORY that will pull the most reach for this scenario while keeping the page varied — commercial airliner, military, vintage/warbird, or anything else that fits — then pick a specific, recognisable aircraft and name it briefly. Range widely, avoid recent repeats and the same few defaults, and let the learned playbook guide the call. This is an RC scale model, so any pairing is fair game. Do not describe its colours or markings.`
    : 'Aircraft: YOU choose any aircraft you judge will pull the most reach — lean toward the surprising or rarely-seen — and range widely, consciously avoiding the same few defaults. Name it briefly. Do not describe its markings.'
  parts.push(aircraftLine)

  // Per-scenario variety: steer away from airline+model combos already used for
  // THIS scenario, so coverage spreads (the same combo can still appear under a
  // different scenario). Commercial picks only.
  if (aircraft !== 'placeholder' && avoidAircraft.length) {
    parts.push(`These aircraft have ALREADY done well for this exact scenario — to broaden coverage, pick a DIFFERENT one and do NOT repeat any of these (a different airline, type, or model all count as different):\n${avoidAircraft.map((a) => '- ' + a).join('\n')}`)
  }

  // Operator-region restriction: hard constraint that overrides the "range
  // widely across the world's airlines" guidance in the aircraft line above.
  // 'tier1' is the original lever; 'europe' is its European counterpart.
  const region = req.region || (req.tier1Only ? 'tier1' : 'any')
  if (region === 'tier1' && aircraft !== 'placeholder') {
    parts.push(`TIER-1 COUNTRY RESTRICTION (hard constraint): the aircraft's airline or operator MUST be based in one of these Tier-1 countries — ${TIER1_COUNTRIES}. This OVERRIDES any "range widely across the world's airlines" guidance above: still vary and avoid recent repeats, but ONLY within these countries. For a commercial airliner pick a real flag carrier or major airline from one of these nations (e.g. American Airlines, Delta, United, Southwest, JetBlue, Alaska Airlines, Air Canada, WestJet, British Airways, Virgin Atlantic, Qantas, Jetstar, Air New Zealand); for a military or vintage aircraft use one operated by one of these countries' armed forces. Do NOT pick an airline or operator from outside this list — in particular no European carriers (e.g. Lufthansa, Air France, KLM), and no Asian or Gulf carriers (e.g. ANA, Japan Airlines, Emirates, Qatar, Singapore Airlines).`)
  } else if (region === 'europe' && aircraft !== 'placeholder') {
    parts.push(`EUROPE-ONLY RESTRICTION (hard constraint): the aircraft's airline or operator MUST be based in a European country (the UK counts as Europe here). This OVERRIDES any "range widely across the world's airlines" guidance above: still vary and avoid recent repeats, but ONLY within Europe. For a commercial airliner pick a real European carrier (e.g. ${EUROPE_EXAMPLES}); for a military or vintage aircraft use one operated by a European air force. Do NOT pick an operator from outside Europe — no US, Canadian, Asian, Gulf, or Oceanian carriers.`)
  }

  const envObj = ENV.find((e) => e.id === env)
  if (sceneLocked) { /* scene, surface and camera are fixed by the scenario block above */ }
  else if (env === 'auto') parts.push(`Environment: YOU choose the setting — this is genuinely your decision, so reason it out rather than defaulting by habit. Weigh every option — grass / farmland field, paved tarmac club strip, coastal or lakeside, arid desert or dry-lakebed, alpine mountain meadow — and pick whichever best fits THIS scenario and will reach furthest, keeping it varied from one clip to the next. Do NOT reflexively fall back to a grass field just because RC models usually fly from grass; choose grass only if it genuinely suits this scenario best. Let what the playbook has learned guide the call.`)
  else if (envObj && envObj.desc) parts.push(`Environment: set it at ${envObj.desc}`)
  if (!sceneLocked && env === 'auto' && avoidEnvs.length) parts.push(`Recent Good/Viral clips for this scenario used these settings — to broaden coverage, choose a DIFFERENT environment and do not repeat: ${avoidEnvs.join('; ')}.`)
  if (!sceneLocked && env !== 'tarmac' && env !== 'auto') parts.push('Surface: there is no paved runway here — taxi, takeoff roll and landing all happen on the natural unpaved ground of THIS setting (grass, sand, dirt or cracked lakebed as fits — not necessarily grass); treat any runway wording as this unpaved strip, and show the airframe bumping, pitching and bobbling over the uneven ground while its wheels are down.')

  // Camera identity — who is holding the camera. Casual eyewitness footage is a
  // strong "is this real?" cue on Reels/Shorts; keep ONE identity per clip.
  if (!sceneLocked) parts.push(camera === 'phone'
    ? 'CAMERA IDENTITY: the whole clip is bystander smartphone footage — handheld at eye level from the crowd line, natural micro-shake and breathing in the frame, slightly imperfect framing with a small drift and re-centre as it tracks the model, a touch of digital-zoom softness on the longest moments. It must read as genuine eyewitness phone video someone just posted, never a polished production. Keep this one identity for the entire clip.'
    : camera === 'longlens'
    ? 'CAMERA IDENTITY: the whole clip is planespotter super-telephoto footage from a distance — heavy lens compression flattening the scene, a smooth tripod pan tracking the model, slight focus breathing and heat-haze shimmer between lens and subject. It must read like avgeek spotter footage. Keep this one identity for the entire clip.'
    : camera === 'broadcast'
    ? 'CAMERA IDENTITY: the whole clip is a professional airshow broadcast camera — a fluid-head pan on a long lens from a fixed elevated platform, steady confident framing that holds the model cleanly, the polish of live event television. Keep this one identity for the entire clip.'
    : 'CAMERA IDENTITY: YOU choose who is holding the camera — bystander smartphone (handheld micro-shake, eyewitness feel — often the strongest "is this real?" cue), planespotter super-telephoto (compression, tripod pan), or an airshow broadcast camera — pick whichever sells the illusion hardest for THIS scenario and vary it across clips. Commit to ONE camera identity and keep it consistent for the whole clip.')

  parts.push('AUDIENCE PATTERNS for this page (weight these): 1) recognisable commercial airliners and famous liveries get the most reach; 2) crowds and airshow settings increase reach; 3) the goal is reach, with realism as the main tool.')

  // Reach Boost — opt-in ceiling-attempt biases distilled from the page's
  // all-time performance analysis (docs/rc_performance_analysis.md). Prompt
  // guidance only, no engine-side lists; hard constraints above still win.
  // Skip the boost block for ramp_glide: its runway/tarmac/rotation biases would
  // only fight the locked lakeside scene, and the scenario block already carries
  // its own aircraft bias (widebody / oddball cargo). A/B tracking is unaffected.
  if (req.boost && !sceneLocked) {
    parts.push(`REACH BOOST (ceiling attempt): this clip is a deliberate attempt at breakout reach. A study of this page's all-time results shows what carries the highest ceiling, so bias every choice the levers above leave OPEN toward: a recognisable commercial airliner in a real major-airline livery (over military or warbird); a widebody or large narrowbody — A380/747/757/A320 class — over small sport types; a paved tarmac runway over grass; a takeoff-rotation or touchdown payoff over taxiing; and a composition built on the runway centerline (the model tracking straight along the line, growing or shrinking in frame) or on the rotation moment caught low from the side, nose up, gear still extended. These are biases, not overrides: the scenario, any operator-region restriction, the avoid lists and the user direction all still win where they conflict.`)
  }

  parts.push(hook
    ? "HOOK MODE ON: introduce exactly ONE plausible-but-impossible structural feature for a 'wait, what is that?' double-take — e.g. two airliner airframes blended (an A380 nose on a 747 body), a stretched extra fuselage section, or an extra engine. It must look fully photoreal and physically built, NOT a CGI glitch, blur, or cartoon. Keep everything else realistic and all audio/Negative rules intact. Make the oddity subtle enough that viewers argue over whether it is real."
    : 'Keep the aircraft anatomically correct and fully real. No impossible features.')

  parts.push(multiShot
    ? 'SHOTS: multiple shots and angle changes are allowed for this one.'
    : 'SHOTS: one single continuous unbroken shot only — no cuts, no angle changes, a single flowing camera move.')

  // Long-prompt mode for scenarios without their own charBudget (ramp_glide
  // announces its lifted budget inside its craft block above).
  if (req.longPrompt && !resolved.charBudget) {
    parts.push(`LONG-PROMPT MODE: the target platform accepts long prompts for this one — the usual under-1500-character limit is LIFTED; write up to ${LONG_PROMPT_CHARS} characters, aiming 3500–4700. Spend the extra room where it compounds: more precise motion physics and pacing beats, richer scale cues and human-relative anchors, finer environment and lighting texture, fuller audio staging, and a longer scenario-matched Negative list. Depth, not padding — every added sentence must earn its place; never repeat yourself or pad to fill space, and keep the same three-section format.`)
  }

  if (punchyOpen) parts.push('OPENING HOOK (critical for reach): engineer the very first ~1 second to STOP THE SCROLL — open on the single most arresting, high-energy beat and a striking first frame that instantly reads as real full-size aviation, so a viewer flicking past freezes on it. No slow build-up or empty lead-in at the start. Keep it inside the shot discipline above and every realism, scale, aerodynamic and Negative rule intact — achieve it through framing, motion and timing, never cuts or CGI tricks.')

  parts.push(`Exploration level: ${explore}/100. ${explore < 34 ? 'Stay close to what has scored well before.' : explore > 66 ? 'Try a fresh environment you have not used, rules intact.' : 'Balance a proven structure with one new element.'}`)

  if (extraNegatives && extraNegatives.trim()) parts.push(`Also ALWAYS include these terms in the Negative section: ${extraNegatives.trim()}.`)

  if (req.useTrends && trends && trends.trim()) parts.push('CURRENT TRENDS (ride these where one fits naturally — never force it, and keep every production, scale, aerodynamic and Negative rule intact):\n' + trends.trim())

  if (playbook && playbook.trim()) parts.push('LEARNED PLAYBOOK (what has worked on this page — reuse the winning ingredients in a fresh scene, heed what flops):\n' + playbook.trim())

  // Remix mode: double down on a proven winner without reposting it. Placed
  // just before the nudge so the user's direction can still steer the remix.
  if (req.remixText && req.remixText.trim()) {
    parts.push(`REMIX A PROVEN WINNER: the prompt below already earned strong reach on this page. Write a FRESH prompt that keeps the ingredients that made it work — its pacing and energy, camera behaviour, crowd feel, scale cues and overall structure — but changes the surface so it never reads as a repost: use a DIFFERENT aircraft/airline (unless the user direction below names one) and vary the setting, lighting or time of day. Do not copy sentences verbatim.\n--- WINNER TO REMIX ---\n${req.remixText.trim()}`)
  }

  // The user's one-off direction is authoritative: it must beat the lever
  // defaults above (aircraft/scenario/crowd/env), which is why it goes last
  // and is stated as an explicit override. Only the fixed production rules hold.
  if (nudge && nudge.trim()) {
    parts.push(`USER DIRECTION FOR THIS ONE — HIGHEST PRIORITY: ${nudge.trim()}.
This direction OVERRIDES the scenario, aircraft, crowd and environment choices above wherever they conflict — follow it exactly. If it names a specific aircraft, airline or livery, USE THAT EXACT ONE: ignore any "range widely / avoid the usual airlines" guidance and ignore the "[MODEL NAME] token / livery from a reference image" instruction for this prompt, and name the aircraft the user asked for. Only the fixed production, scale-illusion, aerodynamic, audio and Negative-section rules stay non-negotiable.`)
  }

  const n = req.candidates && req.candidates > 1 ? req.candidates : 1
  parts.push(n > 1
    ? `Write ${n} clearly DIFFERENT prompts now — vary the aircraft, setting, camera and energy between them so they are genuinely distinct options, each still obeying every rule above. Output each prompt in the exact three-section format, and separate the prompts with a line containing only ${VARIANT_SEPARATOR} (five equals signs). No numbering, no commentary, nothing else between them.`
    : 'Write one new prompt now. Output only the three sections.')
  return parts.join('\n\n')
}

export const CAPTION_SYSTEM = `You write ONE social caption (plus hashtags) for an RC scale-model aircraft video posted to Facebook Reels / YouTube Shorts. The clip shows an RC model filmed to look strikingly real; the honest hook is how real it looks, never a claim that it is a full-size aircraft.
Rules:
- Line 1: the caption — under 200 characters, plain text, no hashtags. Its FIRST few words must hook (viewers only see the first line before "…more"). Make clear it is RC / a scale model. End with a short question that invites comments (comments drive reach) — e.g. would you have believed it, how they'd film it, have they flown one.
- Line 2: 5-8 hashtags separated by single spaces — mix broad reach tags (#rcplane #rcaviation #aviation #scalemodel) with specific ones for this clip (aircraft type, airline, maneuver). Lowercase except proper names.
- No emojis beyond at most one, no quotation marks, no markdown.
Output exactly these two lines and nothing else.`

export function captionMsg(text: string, title: string): string {
  return `Video prompt:\n\n${text}${title ? `\n\nThe video's title (do not repeat it verbatim): ${title}` : ''}`
}

export function titleMsg(text: string, avoid: string[]): string {
  return `Video prompt:\n\n${text}` + (avoid.length ? `\n\nTitles already used recently — make this one clearly different in angle and wording, do NOT echo these:\n${avoid.map((t) => '- ' + t).join('\n')}` : '')
}

// Full rebuild: feed ALL scored results at once and ask for a fresh playbook from
// scratch. Clears drift/forgetting that accumulates from one-at-a-time merges. To
// bound tokens, the full prompt text is included only for winners (Good/Viral) —
// the ones worth emulating; the rest contribute their levers + comment + flags.
export function buildRedistillMessage(entries: Entry[], budget: number): string {
  const lines = entries.map((e, i) => {
    const reach = REACH.find((r) => r.id === e.reach)?.label || 'unknown'
    const flags = e.tags && e.tags.length ? e.tags.join(', ') : 'none'
    const comment = e.comment && e.comment.trim() ? `"${e.comment.trim()}"` : 'none'
    const winner = e.reach === 'good' || e.reach === 'viral'
    const region = e.region || (e.tier1Only ? 'tier1' : '')
    const head = `${i + 1}. [${reach}${typeof e.views === 'number' ? ` · ~${fmtViews(e.views)} views` : ''}] ${e.scenario} · aircraft:${e.aircraft}${e.pickedAircraft ? ` (${e.pickedAircraft})` : ''} · crowd:${e.crowd} · env:${e.env}${e.camera && e.camera !== 'auto' ? ` · cam:${e.camera}` : ''}${region && region !== 'any' ? ` · region:${region}` : ''}${e.boost ? ' · reach-boost' : ''}${e.longPrompt ? ' · long-prompt' : ''}${e.remixOf ? ' · remix-of-winner' : ''}${e.hook ? ' · hook' : ''}${e.multiShot ? ' · multi-shot' : ''}${e.punchyOpen ? ' · punchy-open' : ''}${e.nudge && e.nudge.trim() ? ` · user direction:"${e.nudge.trim().slice(0, 80)}"` : ''}`
    const detail = `   flags: ${flags} · comment: ${comment}`
    const prompt = winner ? `\n   prompt: ${e.text.replace(/\s+/g, ' ').slice(0, 600)}` : ''
    return `${head}\n${detail}${prompt}`
  }).join('\n\n')
  return [
    `Rebuild the ENTIRE playbook FROM SCRATCH from ALL the scored results below — do NOT start from any existing playbook. Look for patterns that REPEAT across results, weight by evidence strength and reach tier, and fold them into one fresh, compact playbook. A single uncommented flop teaches nothing on its own; a signal seen across several results is real.`,
    `ALL SCORED RESULTS (${entries.length}, newest first):\n${lines}`,
    `Output only the rebuilt playbook in markdown, under ${budget} characters, following every rule above.`,
  ].join('\n\n')
}

export function buildLearnMessage(playbook: string, entry: Entry, budget: number): string {
  const reachLabel = REACH.find((r) => r.id === entry.reach)?.label || 'unknown'
  const flags = entry.tags && entry.tags.length ? entry.tags.join(', ') : 'none'
  const comment = entry.comment && entry.comment.trim() ? `"${entry.comment.trim()}"` : 'none'
  return [
    `CURRENT PLAYBOOK:\n${playbook && playbook.trim() ? playbook.trim() : '(empty — start a new one)'}`,
    `NEW RESULT:\n- Reach: ${reachLabel}\n- Scenario: ${entry.scenario}\n- Aircraft pick: ${entry.aircraft}${entry.pickedAircraft ? ` (${entry.pickedAircraft})` : ''}${(entry.region === 'tier1' || (!entry.region && entry.tier1Only)) ? ' (Tier-1 countries restriction was ON — the airline choice was constrained)' : entry.region === 'europe' ? ' (Europe-only restriction was ON — the airline choice was constrained)' : ''}\n- Crowd: ${entry.crowd}\n- Environment: ${entry.env}\n- Camera: ${entry.camera || 'auto'}\n- Hook mode: ${entry.hook ? 'yes' : 'no'}\n- Multi-shot: ${entry.multiShot ? 'yes' : 'no'}\n- Punchy open: ${entry.punchyOpen ? 'yes' : 'no'}${entry.boost ? '\n- Reach Boost: ON (ceiling-attempt biases from the performance analysis were applied)' : ''}${entry.longPrompt ? `\n- Long-prompt mode: ON (${LONG_PROMPT_CHARS}-char budget instead of the usual limit)` : ''}${typeof entry.views === 'number' ? `\n- Approximate all-time views: ${fmtViews(entry.views)}` : ''}${entry.remixOf ? '\n- Remixed from a previous Good/Viral winner (deliberately reused its winning ingredients)' : ''}${entry.nudge && entry.nudge.trim() ? `\n- User's one-off direction for this clip (overrode the levers): "${entry.nudge.trim()}"` : ''}\n- Illusion-break flags: ${flags}\n- Creator comment: ${comment}`,
    `The exact prompt that produced it:\n${entry.text}`,
    `Diagnose the REAL reason from the comment and flags, attach the lesson to that root cause as a transferable craft rule, and do NOT blame the environment / scenario / aircraft unless the evidence points there. If there is no comment and no flag, do not invent a cause. Rewrite the whole playbook now. Markdown only, under ${budget} characters.`,
  ].join('\n\n')
}
