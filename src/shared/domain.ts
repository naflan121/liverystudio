import type { Scenario } from './types'

export const REACH = [
  { id: 'flop', label: 'Flopped', color: '#B23A2E' },
  { id: 'normal', label: 'Normal', color: '#6B6862' },
  { id: 'good', label: 'Good reach', color: '#1F7A4D' },
  { id: 'viral', label: 'Went viral', color: '#B8389E' },
] as const

export const ILLUSION_TAGS = [
  'Scale drifted to full-size',
  'CGI / AI sheen',
  'Wrong engine sound',
  'Floaty / kite physics',
  'Toy-like',
  'Other',
]

export const AIRCRAFT = [
  { id: 'auto', label: 'Let Claude decide' },
  { id: 'placeholder', label: '[MODEL NAME] placeholder' },
  { id: 'commercial', label: 'Claude picks: commercial airliner' },
  { id: 'military', label: 'Claude picks: military' },
  { id: 'vintage', label: 'Claude picks: vintage / warbird' },
  { id: 'surprise', label: 'Claude picks: surprise me' },
]

// Camera identity — who is "holding the camera". A huge authenticity lever for
// the "is this real?" illusion: casual bystander phone footage reads as genuine
// eyewitness video, planespotter glass reads as avgeek content.
export const CAMERA = [
  { id: 'auto', label: 'Let Claude decide' },
  { id: 'phone', label: 'Bystander phone (handheld)' },
  { id: 'longlens', label: 'Planespotter long lens' },
  { id: 'broadcast', label: 'Airshow broadcast cam' },
]

// Operator region restriction for the airline/operator pick. 'tier1' is the
// original hard lever (US/CA/UK/AU/NZ); 'europe' is its European counterpart.
export const REGION = [
  { id: 'any', label: 'Any region (Claude decides)' },
  { id: 'tier1', label: 'Tier-1 only (US · CA · UK · AU · NZ)' },
  { id: 'europe', label: 'Europe only' },
]

export const CROWD = [
  { id: 'auto', label: 'Let Claude decide' },
  { id: 'solo', label: 'Solo / quiet field' },
  { id: 'busy', label: 'Busy flightline' },
  { id: 'packed', label: 'Packed airshow' },
]

export const ENV = [
  { id: 'auto', label: 'Let Claude decide', desc: '' },
  { id: 'grass', label: 'Grass flying field (farmland)', desc: 'a real RC grass flying field: a mown grass strip with visible mowing lines, patches of longer uncut grass and a standing crop edge (maize or wheat) bordering it, gently rolling farmland behind, hedgerows and tree lines, the odd barn or shed, bright clear summer light. No paved runway.' },
  { id: 'tarmac', label: 'Tarmac strip / club field', desc: 'a small club airfield with a narrow paved tarmac strip, a dashed centreline and orange cones, grass verges, a clubhouse and low fencing.' },
  { id: 'coastal', label: 'Coastal / waterside', desc: 'a coastal or lakeside setting — open water, a shoreline of grass or sand, big open sky and distant low hills.' },
  { id: 'desert', label: 'Desert / dry lakebed', desc: 'an arid dry-lakebed or desert strip — cracked pale ground, sparse scrub, shimmering heat haze and a wide empty horizon.' },
  { id: 'mountain', label: 'Mountain field', desc: 'an alpine mountain-meadow strip with dramatic peaks and pine slopes behind and crisp clear air.' },
]

export const SCENARIOS: Scenario[] = [
  { id: 'random', label: 'Random (pick one for me)', group: '', brief: '' },
  { id: 'runway_takeoff', label: 'Runway takeoff', group: 'Flight', brief: 'A single-clip runway takeoff showing the full takeoff run up to V1 and rotation. Filmed side-on at eye level from behind the barrier, the RC pilot (a figure in FPV goggles working an RC transmitter) clearly visible in the near foreground throughout. The model travels one fixed direction the whole clip; the camera pans to follow. The clip is almost entirely the GROUND RUN: the model starts its roll and accelerates down a long stretch of the strip in real time — wheels rolling, tail low, nose gear compressed, speed building in stages (a rolling start, gathering speed across the mid-strip, then approaching V1) while small rudder twitches hold the centreline. It reaches V1 and rotates only in the final moment, the nose lifting and the main wheels just breaking contact as the clip ends. Do not show a climb or any altitude gain — the clip ends right at liftoff. The run must dominate; no early rotation, no short ground roll.' },
  { id: 'centerline', label: 'Centerline departure (down-the-runway)', group: 'Flight', brief: 'A down-the-runway centerline shot: the camera sits low on or just beside the runway centerline while the model tracks straight along the line — either departing away (accelerating, shrinking down the line, rotating at the far end) or arriving head-on (growing steadily in frame until it lifts just over the camera). The runway line dominates the composition for the whole clip; one fixed direction, the camera holding nearly still.' },
  { id: 'landing', label: 'Landing', group: 'Flight', brief: 'A landing: real approach, nose-up flare, wheel chirp, a small bounce, then rollout. Never a vertical descent.' },
  { id: 'touch_and_go', label: 'Touch-and-go', group: 'Flight', brief: 'A touch-and-go: brief main-wheel contact and chirp, then power back on and climb away in the same direction.' },
  { id: 'low_pass', label: 'Low pass / high-speed flyby', group: 'Flight', brief: 'A fast, flat low pass close to the crowd, motor screaming, prop fluttering, spectators flinching and tracking it.' },
  { id: 'taxi', label: 'Taxi to the runway', group: 'Flight', brief: 'A ground taxi: weaving slightly, props idling, airframe bobbing over seams, holding short near the crowd line.' },
  { id: 'airshow_flyby', label: 'Airshow crowd flyby', group: 'Flight', brief: 'A busy airshow with grandstands; a single pass with the whole crowd in frame for scale.' },
  { id: 'distant_reveal', label: 'Distant reveal (scale-bait)', group: 'Flight', brief: 'A deliberately ambiguous-scale shot: the model on a long, distant final approach or a far-off flypast, framed clean against sky and runway with NO size references in frame. HIDE THE SCALE for this one — you are explicitly instructed to leave out the scale anchors, spectators and RC-pilot cues, keep the framing distant, and let the clip read as possibly full-size so viewers argue in the comments about whether it is real; the debate is the hook. Aerodynamic realism, RC-sound audio and every Negative rule still apply in full.' },
  { id: 'formation', label: 'Formation / multi-plane pass', group: 'Flight', brief: 'Two or three models in tight formation on a single pass, holding spacing, all moving the same direction.' },
  { id: 'aerobatic', label: 'Aerobatic display', group: 'Flight', brief: 'An aerobatic pass — a roll or wingover — kept within believable RC energy, with wing rock and trim wobble.' },
  { id: 'warbird', label: 'Vintage warbird display', group: 'Flight', brief: 'A vintage warbird display pass, classic livery, weathered panels, period airfield setting.' },
  // Proven-viral format from the ramp-glide-splash concept study (v1–v4). The
  // craft rules that make it generate cleanly (flip-proof geometry, announcer
  // audio, extended Negative list) live in a dedicated block in prompts.ts.
  { id: 'ramp_glide', label: 'Ramp glide & splash (lakeside festival)', group: 'Water', weight: 3, charBudget: 3800, brief: 'The viral "ramp glide & splash" format: vertical drone footage, one single continuous unbroken take at natural real-time speed, at a bright lakeside summer festival — a tall wooden launch tower rising from the shore of a calm green lake, a curved plywood ramp at its top, colorful abstract banners with no readable text draped down its side, dense crowds behind barriers on the grassy bank, white and yellow event tents. The aircraft is a lightweight two-meter foam-and-plastic RC scale model, engines silent and unpowered, its physical scale constant for the entire clip, perched on the ramp lip with crew hands steadying its wingtips. The hands shove it off and it settles into a long, impossibly steady dead-stick glide a few meters above the water — wings level, tiny wobbles, sinking imperceptibly, never climbing, never turning — until in the final seconds its belly kisses the lake and ploughs a huge white spray plume, skiing in a widening V-shaped wake before slowing and settling afloat as the clip ends.' },
  { id: 'water_takeoff', label: 'Water takeoff (seaplane)', group: 'Water', brief: 'A floatplane water takeoff: taxi cutting a V-wake, spray off the hull, lift-off with droplets trailing the floats.' },
  { id: 'water_landing', label: 'Water landing (seaplane)', group: 'Water', brief: 'A floatplane water landing: shallow approach, floats contacting with weight, fan of spray, planing taxi.' },
  { id: 'belly_landing', label: 'Gear-up belly landing (incident)', group: 'Incident', brief: 'A gear-up belly landing: low approach, fuselage skidding with a scrape and dust, emergency crews near.' },
  { id: 'ground_mishap', label: 'Ground mishap / abort', group: 'Incident', brief: 'A harmless ground mishap: an aborted takeoff or a nose-over on landing, model intact, crowd reacting. No gore.' },
  { id: 'boneyard', label: 'Boneyard dismantling timelapse', group: 'Ground', brief: 'A documentary boneyard part-out timelapse of a parked airframe. No flight, but every scale, anti-AI, audio, and Negative rule still applies; the illusion is a tiny model reading as a real scrapped airliner.' },
  { id: 'assembly', label: 'Scale model assembly POV', group: 'Ground', brief: 'A first-person workshop build / factory-style assembly timelapse. No flight maneuvers — focus on hands, parts, and scale realism.' },
]

/** Weighted random scenario pick for the "Random" option. Scenarios carry an
 *  optional `weight` (default 1); formats with proven virality get a higher
 *  weight so random generation spends more shots on the likeliest breakouts. */
export function pickRandomScenario(): Scenario {
  const pool = SCENARIOS.filter((s) => s.id !== 'random')
  let r = Math.random() * pool.reduce((sum, s) => sum + (s.weight ?? 1), 0)
  for (const s of pool) {
    r -= s.weight ?? 1
    if (r < 0) return s
  }
  return pool[pool.length - 1]
}

export function groupScenarios(): [string, Scenario[]][] {
  const order = ['', 'Flight', 'Water', 'Incident', 'Ground']
  const map: Record<string, Scenario[]> = {}
  SCENARIOS.forEach((s) => { (map[s.group] = map[s.group] || []).push(s) })
  return order.filter((g) => map[g]).map((g) => [g, map[g]] as [string, Scenario[]])
}
