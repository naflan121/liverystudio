import React, { useState, useEffect, useCallback } from "react";

const INK = "#1C1B19";
const PAPER = "#FBFAF7";
const LINE = "#DAD6CC";
const MUTE = "#6B6862";
const ACCENT = "#E85D1A";
const GOOD = "#1F7A4D";
const BAD = "#B23A2E";
const VIRAL = "#B8389E";
const WAIT = "#9A968C";
const SCREEN = "#1A1915";
const SCREEN_TX = "#ECE7DB";

const REACH = [
  { id: "flop", label: "Flopped", color: BAD },
  { id: "normal", label: "Normal", color: MUTE },
  { id: "good", label: "Good reach", color: GOOD },
  { id: "viral", label: "Went viral", color: VIRAL },
];

const ILLUSION_TAGS = ["Scale drifted to full-size", "CGI / AI sheen", "Wrong engine sound", "Floaty / kite physics", "Toy-like", "Other"];

const AIRCRAFT = [
  { id: "placeholder", label: "[MODEL NAME] placeholder" },
  { id: "commercial", label: "Claude picks: commercial airliner" },
  { id: "military", label: "Claude picks: military" },
  { id: "vintage", label: "Claude picks: vintage / warbird" },
  { id: "surprise", label: "Claude picks: surprise me" },
];

const CROWD = [
  { id: "auto", label: "Let Claude decide" },
  { id: "solo", label: "Solo / quiet field" },
  { id: "busy", label: "Busy flightline" },
  { id: "packed", label: "Packed airshow" },
];

const ENV = [
  { id: "auto", label: "Let Claude decide", desc: "" },
  { id: "grass", label: "Grass flying field (farmland)", desc: "a real RC grass flying field: a mown grass strip with visible mowing lines, patches of longer uncut grass and a standing crop edge (maize or wheat) bordering it, gently rolling farmland behind, hedgerows and tree lines, the odd barn or shed, bright clear summer light. No paved runway." },
  { id: "tarmac", label: "Tarmac strip / club field", desc: "a small club airfield with a narrow paved tarmac strip, a dashed centreline and orange cones, grass verges, a clubhouse and low fencing." },
  { id: "coastal", label: "Coastal / waterside", desc: "a coastal or lakeside setting — open water, a shoreline of grass or sand, big open sky and distant low hills." },
  { id: "desert", label: "Desert / dry lakebed", desc: "an arid dry-lakebed or desert strip — cracked pale ground, sparse scrub, shimmering heat haze and a wide empty horizon." },
  { id: "mountain", label: "Mountain field", desc: "an alpine mountain-meadow strip with dramatic peaks and pine slopes behind and crisp clear air." },
];

const SCENARIOS = [
  { id: "random", label: "Random (pick one for me)", group: "", brief: "" },
  { id: "runway_takeoff", label: "Runway takeoff", group: "Flight", brief: "A single-clip runway takeoff showing the full takeoff run up to V1 and rotation. Filmed side-on at eye level from behind the barrier, the RC pilot (a figure in FPV goggles working an RC transmitter) clearly visible in the near foreground throughout. The model travels one fixed direction the whole clip; the camera pans to follow. The clip is almost entirely the GROUND RUN: the model starts its roll and accelerates down a long stretch of the strip in real time — wheels rolling, tail low, nose gear compressed, speed building in stages (a rolling start, gathering speed across the mid-strip, then approaching V1) while small rudder twitches hold the centreline. It reaches V1 and rotates only in the final moment, the nose lifting and the main wheels just breaking contact as the clip ends. Do not show a climb or any altitude gain — the clip ends right at liftoff. The run must dominate; no early rotation, no short ground roll." },
  { id: "landing", label: "Landing", group: "Flight", brief: "A landing: real approach, nose-up flare, wheel chirp, a small bounce, then rollout. Never a vertical descent." },
  { id: "touch_and_go", label: "Touch-and-go", group: "Flight", brief: "A touch-and-go: brief main-wheel contact and chirp, then power back on and climb away in the same direction." },
  { id: "low_pass", label: "Low pass / high-speed flyby", group: "Flight", brief: "A fast, flat low pass close to the crowd, motor screaming, prop fluttering, spectators flinching and tracking it." },
  { id: "taxi", label: "Taxi to the runway", group: "Flight", brief: "A ground taxi: weaving slightly, props idling, airframe bobbing over seams, holding short near the crowd line." },
  { id: "airshow_flyby", label: "Airshow crowd flyby", group: "Flight", brief: "A busy airshow with grandstands; a single pass with the whole crowd in frame for scale." },
  { id: "formation", label: "Formation / multi-plane pass", group: "Flight", brief: "Two or three models in tight formation on a single pass, holding spacing, all moving the same direction." },
  { id: "aerobatic", label: "Aerobatic display", group: "Flight", brief: "An aerobatic pass — a roll or wingover — kept within believable RC energy, with wing rock and trim wobble." },
  { id: "warbird", label: "Vintage warbird display", group: "Flight", brief: "A vintage warbird display pass, classic livery, weathered panels, period airfield setting." },
  { id: "water_takeoff", label: "Water takeoff (seaplane)", group: "Water", brief: "A floatplane water takeoff: taxi cutting a V-wake, spray off the hull, lift-off with droplets trailing the floats." },
  { id: "water_landing", label: "Water landing (seaplane)", group: "Water", brief: "A floatplane water landing: shallow approach, floats contacting with weight, fan of spray, planing taxi." },
  { id: "belly_landing", label: "Gear-up belly landing (incident)", group: "Incident", brief: "A gear-up belly landing: low approach, fuselage skidding with a scrape and dust, emergency crews near." },
  { id: "ground_mishap", label: "Ground mishap / abort", group: "Incident", brief: "A harmless ground mishap: an aborted takeoff or a nose-over on landing, model intact, crowd reacting. No gore." },
  { id: "boneyard", label: "Boneyard dismantling timelapse", group: "Ground", brief: "A documentary boneyard part-out timelapse of a parked airframe. No flight, but every scale, anti-AI, audio, and Negative rule still applies; the illusion is a tiny model reading as a real scrapped airliner." },
  { id: "assembly", label: "Scale model assembly POV", group: "Ground", brief: "A first-person workshop build / factory-style assembly timelapse. No flight maneuvers — focus on hands, parts, and scale realism." },
];

const SYSTEM = `You write image-to-video prompts for Seedance 2.0. The footage is RC scale-model aircraft, filmed so it looks like genuine full-size real-world aviation video — the "is this real?" illusion. The ultimate goal is REACH on short-form social video; photorealism is your main tool for that. You may sometimes be explicitly asked to add one photoreal-but-impossible "hook" detail — when given that instruction, follow it; otherwise keep everything anatomically real.

OUTPUT FORMAT — follow exactly:
- Output ONLY three labelled sections, in flowing prose (never bullets): "Visual:" then a blank line, "Audio:" then a blank line, "Negative:".
- No preamble, no title, no markdown, no commentary. Nothing before "Visual:" and nothing after the Negative section.
- HARD LIMIT: under 1500 characters. Aim 1400–1490.

LIVERY ECONOMY (important): Name the aircraft, airline, and livery in just a few words (e.g. "Emirates A380", or the literal [MODEL NAME] token) and STOP. Do NOT describe paint colours, stripe patterns, tail logos, registration, or any livery detail — the exact livery is supplied separately as a reference image, so characters spent on it are wasted. Put every saved character into what a reference image CANNOT fix: the takeoff/landing physics and motion, scale cues, camera move, audio, environment, and crowd. Motion and physics errors ruin a clip and cannot be patched afterward; livery imperfections can.

SCALE-ILLUSION RULES:
- Lead with physical dimensions and a human-relative scale anchor BEFORE naming the aircraft (e.g. "barely knee-height", "forearm-sized").
- Keep adult spectators and scale-reference objects in frame throughout.
- RC PILOT (always, for any flying scene): include an RC pilot in frame — a figure wearing FPV goggles and holding an RC transmitter — positioned behind the model or at the crowd line where it reads naturally. This is a key authenticity and scale cue.
- RC physics cues: lightweight foam-and-plastic airframe, slight wobble, brushless-motor behaviour.

AERODYNAMIC REALISM (when the scene involves flight):
- Takeoff (critical — the model must NOT rise like a helicopter): open with a long, EXTENDED real-time ground roll that dominates most of the clip — wheels rolling on the surface, tail low, nose gear compressed, speed building gradually across a long stretch of runway; the model stays firmly on the ground for a sustained run and reaches the rotation point (V1/Vr) only late in the clip, at which point the nose lifts and the mains leave the surface; then a shallow forward climb where forward speed stays clearly greater than climb rate, with slight wing rock and a pitch bobble. The ground run must take up most of the shot. No instant or early liftoff, no vertical rise, no hovering, no climbing in place. For any takeoff or climb-out, the Negative section must ALSO include: helicopter motion, vertical takeoff, climbing without forward motion, hovering, early liftoff, short ground roll, steep climb, slow motion, direction reversal.
- Landing: real approach, nose-up flare, wheel chirp, small bounce, rollout — never a vertical descent.
- Low pass: high speed, flat path. Lock ONE direction per clip; never reverse mid-clip.
- Surface: on grass or any unpaved strip the takeoff roll, taxi and landing rollout are bumpy — the gear sinks slightly into the turf and the airframe pitches, jostles and bobbles over the uneven ground, nose and wings bobbing; on smooth tarmac the roll is clean. This bump applies only while wheels are on the ground, never in flight.

AUDIO: RC sounds only — brushless motor whine, sharp buzzing screech at full throttle, propeller blade flutter — plus fitting ambience.

NEGATIVE SECTION — must ALWAYS include all of: full-size aircraft, real airliner proportions, jet engine roar, turbine whine, deep engine rumble, oversized model, toy-like appearance, perfect symmetry, CGI glow, watermark, on-screen text, cartoon, low resolution, motion blur artifacts. Add scenario-appropriate extras. (Even in hook mode keep these — the hook is a real-looking structural oddity, not a CGI glitch.)

ANTI-AI REALISM: embed small deliberate imperfections (a crooked banner, paper cups, a crowd flinch, a figure adjusting sunglasses). Write "a figure" — never "man", "person", or a named individual.

SHOT DISCIPLINE: By default the whole clip is ONE single continuous unbroken shot — a single flowing camera move, no cuts, no angle changes, no edits. Continuous single takes tend to reach further. Only use multiple shots or angle changes when explicitly instructed.

VARIETY: vary environment, lighting, and camera every time. Do not reuse a scene you were shown as an example.`;

async function callClaude(userContent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: SYSTEM, messages: [{ role: "user", content: userContent }] }),
  });
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

const TITLE_SYSTEM = `You write ONE title for a social RC scale-model aircraft video (Facebook Reels, YouTube Shorts). It doubles as SEO, so it must be search-friendly and VARIED — never a fixed template. The clip shows an RC model filmed to look incredibly real; the honest hook is how real the RC looks, NOT a claim that it is a real aircraft. Rules:
- It MUST make clear this is RC or a scale model (include "RC" or "scale model").
- Vary the angle every single time — rotate between: a question, the aircraft type plus the maneuver, astonishment at the scale or size, the realism, the airshow or location, the rarity of the type. Do NOT reuse the same sentence structure twice.
- Lead with the words a viewer would actually search for or stop on (the aircraft type, "RC", the action).
- Under 70 characters; plain text only; no quotation marks, no markdown, no hashtags, no emojis, and none of these characters \\ / : * ? " < > |.
Output only the title, nothing else.`;

async function callTitle(userContent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 60, system: TITLE_SYSTEM, messages: [{ role: "user", content: userContent }] }),
  });
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

export default function App() {
  const [history, setHistory] = useState([]);
  const [scenario, setScenario] = useState("random");
  const [aircraft, setAircraft] = useState("placeholder");
  const [crowd, setCrowd] = useState("busy");
  const [env, setEnv] = useState("auto");
  const [hook, setHook] = useState(false);
  const [multiShot, setMultiShot] = useState(false);
  const [nudge, setNudge] = useState("");
  const [explore, setExplore] = useState(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null);
  const [pickedTags, setPickedTags] = useState([]);
  const [comment, setComment] = useState("");
  const [showLearn, setShowLearn] = useState(false);
  const [filter, setFilter] = useState("toscore");

  useEffect(() => {
    (async () => { try { const r = await window.storage.get("rc:history:v31"); if (r && r.value) setHistory(JSON.parse(r.value)); } catch (e) {} })();
  }, []);

  const persist = useCallback(async (next) => {
    setHistory(next);
    try { await window.storage.set("rc:history:v31", JSON.stringify(next.slice(-120)), false); } catch (e) {}
  }, []);

  const rated = history.filter((h) => h.status === "scored" && h.reach);
  const tierCount = (id) => rated.filter((h) => h.reach === id).length;
  const strong = rated.filter((h) => h.reach === "viral" || h.reach === "good");
  const hookTries = rated.filter((h) => h.hook);
  const hookStrong = hookTries.filter((h) => h.reach === "viral" || h.reach === "good");
  const recentComments = history.filter((h) => h.comment && h.comment.trim() && h.status === "scored").slice(-5);

  const counts = {
    toscore: history.filter((h) => h.status === "queued" || h.status === "posted").length,
    scored: history.filter((h) => h.status === "scored").length,
    skipped: history.filter((h) => h.status === "skipped").length,
    all: history.length,
  };

  function learningContext() {
    const blocks = [];
    const best = [...strong].sort((a, b) => (a.reach === "viral" ? -1 : 1) - (b.reach === "viral" ? -1 : 1)).slice(-3);
    if (best.length) blocks.push("PROMPTS THAT GOT STRONG REACH (reuse the winning ingredients, fresh scene):\n" + best.map((g) => `[${g.reach === "viral" ? "VIRAL" : "good"} · ${g.scenario}${g.hook ? " · hook" : ""}]\n${g.text}`).join("\n\n"));
    if (rated.length) {
      const lines = [`Tally — viral ${tierCount("viral")}, good ${tierCount("good")}, normal ${tierCount("normal")}, flop ${tierCount("flop")}.`];
      if (hookTries.length) lines.push(`Hook mode: ${hookStrong.length} strong out of ${hookTries.length}.`);
      const packed = rated.filter((h) => h.crowd === "packed");
      if (packed.length) lines.push(`Packed-airshow scenes: ${packed.filter((h) => h.reach === "viral" || h.reach === "good").length} strong of ${packed.length}.`);
      blocks.push("REACH SCOREBOARD (steer toward what scores):\n" + lines.join("\n"));
    }
    if (recentComments.length) blocks.push("NOTES ON RECENT RESULTS (apply directly):\n" + recentComments.map((c) => `- (${REACH.find((r) => r.id === c.reach)?.label || "?"}) "${c.comment.trim()}"`).join("\n"));
    return blocks.join("\n\n");
  }

  function buildUserMessage(resolved) {
    const parts = [];
    let sc = `Scenario: ${resolved.brief || "Choose a strong scenario yourself."}`;
    if (!["boneyard", "assembly"].includes(resolved.id)) sc += " " + (crowd === "solo" ? "Keep it a quiet solo session, a few people at most." : crowd === "packed" ? "Make it a packed airshow with grandstands and dense spectators in frame — crowds boost reach." : crowd === "auto" ? "Choose the crowd size that best fits this scenario and gives the strongest reach — anywhere from a quiet field to a packed airshow; remember crowds tend to lift reach." : "Populate it with a busy flightline crowd, people in frame throughout.");
    parts.push(sc);
    if (resolved.id === "runway_takeoff") parts.push("TAKEOFF RUN IS THE WHOLE CLIP: spend the great majority of the 15-second clip on the GROUND RUN — the model accelerating along the strip on its wheels, still on the ground. It reaches V1 and rotates only in the final moments, and the clip ENDS right as the wheels lift off. Do NOT show a climb or altitude gain. Keep it on the ground as long as possible — a short run or an early rotation is the single failure to avoid here.");
    const REGIONS = ["the Gulf / Middle East", "Western Europe", "Scandinavia or the Nordics", "Eastern Europe", "Turkey or Central Asia", "East Asia (Japan, Korea, China, Taiwan)", "Southeast Asia", "South Asia", "Oceania", "North America", "Latin America", "Africa", "a major low-cost carrier anywhere", "a cargo or freight operator", "a classic or retired livery"];
    const FORCES = ["the US", "Russia or the former USSR", "the UK", "France", "Germany", "Israel", "India", "China", "Japan", "Sweden", "a smaller NATO air force", "a lesser-known air force"];
    const ERAS = ["WWI", "the interwar years", "WWII", "the early jet age of the 1950s", "the Cold War", "a lesser-known classic from any country"];
    const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
    const aircraftLine = aircraft === "placeholder"
      ? "Aircraft: write the model as the literal token [MODEL NAME] and nothing more — livery comes from a reference image. Do not invent one or describe any colours."
      : aircraft === "commercial"
      ? `Aircraft: pick a recognisable commercial airliner and name it briefly as airline plus model. Range widely across the world's airlines and do NOT default to the same few — actively avoid always reaching for Emirates, Qatar, United, or other obvious go-tos. For this one, lean toward an airline from ${pickOne(REGIONS)}. Do not describe its colours, stripes, or logos.`
      : aircraft === "military"
      ? `Aircraft: pick a recognisable military aircraft and name it briefly. Range across the world's air forces rather than repeating the usual ones; for this one lean toward ${pickOne(FORCES)}. Do not describe its markings.`
      : aircraft === "vintage"
      ? `Aircraft: pick a recognisable vintage or warbird aircraft and name it briefly. Range across eras and countries; for this one lean toward ${pickOne(ERAS)}. Do not describe its markings.`
      : "Aircraft: pick any aircraft you think will pull reach and name it briefly, ranging widely across the world and consciously avoiding the same few defaults. Do not describe its markings.";
    parts.push(aircraftLine);
    const envObj = ENV.find((e) => e.id === env);
    if (env === "auto") parts.push("Environment: choose a setting that fits and looks convincingly real; natural grass flying fields with farmland behind read especially well.");
    else if (envObj && envObj.desc) parts.push(`Environment: set it at ${envObj.desc}`);
    if (env !== "tarmac" && env !== "auto") parts.push("Surface: there is no paved runway here — taxi, takeoff roll and landing all happen on the mown grass or unpaved ground; treat any runway wording as this unpaved strip, and show the airframe bumping, pitching and bobbling over the uneven ground while its wheels are down.");
    parts.push("AUDIENCE PATTERNS for this page (weight these): 1) recognisable commercial airliners and famous liveries get the most reach; 2) crowds and airshow settings increase reach; 3) the goal is reach, with realism as the main tool.");
    parts.push(hook ? "HOOK MODE ON: introduce exactly ONE plausible-but-impossible structural feature for a 'wait, what is that?' double-take — e.g. two airliner airframes blended (an A380 nose on a 747 body), a stretched extra fuselage section, or an extra engine. It must look fully photoreal and physically built, NOT a CGI glitch, blur, or cartoon. Keep everything else realistic and all audio/Negative rules intact. Make the oddity subtle enough that viewers argue over whether it is real." : "Keep the aircraft anatomically correct and fully real. No impossible features.");
    parts.push(multiShot ? "SHOTS: multiple shots and angle changes are allowed for this one." : "SHOTS: one single continuous unbroken shot only — no cuts, no angle changes, a single flowing camera move.");
    parts.push(`Exploration level: ${explore}/100. ${explore < 34 ? "Stay close to what has scored well before." : explore > 66 ? "Try a fresh environment you have not used, rules intact." : "Balance a proven structure with one new element."}`);
    if (nudge.trim()) parts.push(`User direction for this one: ${nudge.trim()}`);
    const ctx = learningContext();
    if (ctx) parts.push(ctx);
    parts.push("Write one new prompt now. Output only the three sections.");
    return parts.join("\n\n");
  }

  async function generate() {
    setError(""); setLoading(true); setPickedTags([]); setComment("");
    const pool = SCENARIOS.filter((s) => s.id !== "random");
    const resolved = scenario === "random" ? pool[Math.floor(Math.random() * pool.length)] : SCENARIOS.find((s) => s.id === scenario);
    try {
      let text = await callClaude(buildUserMessage(resolved));
      if (text.length > 1500) text = await callClaude(`This prompt is ${text.length} characters, over the 1500 limit. Rewrite under 1480, keeping all three sections and every required Negative term. Output only the prompt:\n\n${text}`);
      let title = "";
      try { title = cleanTitle(await callTitle(titleMsg(text))); } catch (e) {}
      const filename = toFilename(title || resolved.label);
      const entry = { id: Date.now(), text, title, filename, scenario: resolved.label, aircraft, crowd, env, hook, multiShot, status: "queued", postedAt: null, reach: null, tags: [], comment: "", ts: new Date().toISOString() };
      setCurrent(entry); persist([entry, ...history]);
    } catch (e) { setError("Could not reach the model. Check your connection and try again."); } finally { setLoading(false); }
  }

  function openEntry(h) { setCurrent(h); setPickedTags(h.tags || []); setComment(h.comment || ""); }
  function updateEntry(patch) {
    if (!current) return;
    const updated = { ...current, comment: comment.trim(), tags: pickedTags, ...patch };
    setCurrent(updated); persist(history.map((h) => (h.id === current.id ? updated : h)));
  }
  function toggleTag(t) { setPickedTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t])); }
  function patchCurrent(patch) { if (!current) return; const updated = { ...current, ...patch }; setCurrent(updated); persist(history.map((h) => (h.id === current.id ? updated : h))); }
  function titleAvoidList(extra) {
    const arr = history.filter((h) => h.title && h.title.trim()).map((h) => h.title.trim());
    if (extra) arr.push(extra);
    return [...new Set(arr)].slice(-8);
  }
  function titleMsg(text, extra) {
    const avoid = titleAvoidList(extra);
    return `Video prompt:\n\n${text}` + (avoid.length ? `\n\nTitles already used recently — make this one clearly different in angle and wording, do NOT echo these:\n${avoid.map((t) => "- " + t).join("\n")}` : "");
  }
  async function regenerateTitle() { if (!current) return; try { const t = cleanTitle(await callTitle(titleMsg(current.text, current.title))); patchCurrent({ title: t, filename: toFilename(t || current.scenario) }); } catch (e) {} }
  async function clearAll() { try { await window.storage.delete("rc:history:v31"); } catch (e) {} setHistory([]); setCurrent(null); }

  const count = current ? current.text.length : 0;
  const over = count > 1500;
  const sections = current ? splitSections(current.text) : null;
  const ctxPreview = learningContext();
  const cur = current ? history.find((h) => h.id === current.id) || current : null;

  let view = [...history];
  if (filter === "toscore") view = view.filter((h) => h.status === "queued" || h.status === "posted");
  else if (filter === "scored") view = view.filter((h) => h.status === "scored");
  else if (filter === "skipped") view = view.filter((h) => h.status === "skipped");

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: "ui-sans-serif, system-ui, sans-serif", borderRadius: 14, border: `1px solid ${LINE}`, overflow: "hidden" }}>
      <div style={{ padding: "20px 22px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, fontWeight: 600 }}>Livery Lab · v3.1 · queue</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>Scale-illusion prompt lab</div>
        </div>
        <div style={{ fontSize: 12, color: MUTE, textAlign: "right", lineHeight: 1.5 }}>
          {counts.toscore > 0 && <div style={{ color: ACCENT, fontWeight: 600 }}>{counts.toscore} awaiting your result</div>}
          {rated.length > 0 && <div><span style={{ color: VIRAL, fontWeight: 600 }}>{tierCount("viral")} viral</span> · {tierCount("good")} good{hookTries.length ? ` · hook ${hookStrong.length}/${hookTries.length}` : ""}</div>}
        </div>
      </div>

      <div style={{ padding: "18px 22px", display: "grid", gap: 16 }}>
        <div>
          <div style={lbl}>Scenario</div>
          <select value={scenario} onChange={(e) => setScenario(e.target.value)} style={sel}>
            {groupScenarios().map(([group, items]) => group === "" ? items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>) : <optgroup key={group} label={group}>{items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
          <div><div style={lbl}>Aircraft</div><select value={aircraft} onChange={(e) => setAircraft(e.target.value)} style={sel}>{AIRCRAFT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
          <div><div style={lbl}>Crowd density</div><select value={crowd} onChange={(e) => setCrowd(e.target.value)} style={sel}>{CROWD.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
          <div><div style={lbl}>Environment</div><select value={env} onChange={(e) => setEnv(e.target.value)} style={sel}>{ENV.map((e2) => <option key={e2.id} value={e2.id}>{e2.label}</option>)}</select></div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: `1px solid ${hook ? ACCENT : LINE}`, borderRadius: 10, padding: "10px 14px", background: hook ? "#FBEADF" : "#fff" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: hook ? ACCENT : INK }}>Hook mode {hook ? "on" : "off"}</div>
            <div style={{ fontSize: 12, color: MUTE }}>One photoreal-but-impossible detail — the viral "what is that?" gamble.</div>
          </div>
          <button onClick={() => setHook((h) => !h)} style={{ border: "none", cursor: "pointer", borderRadius: 20, width: 46, height: 26, background: hook ? ACCENT : "#CBC7BD", position: "relative", flexShrink: 0 }} aria-label="Toggle hook mode"><span style={{ position: "absolute", top: 3, left: hook ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13.5 }}>
          <input type="checkbox" checked={multiShot} onChange={(e) => setMultiShot(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
          <span><span style={{ fontWeight: 600 }}>Allow multiple shots / angles.</span> <span style={{ color: MUTE }}>Off = one continuous take, which tends to reach further.</span></span>
        </label>

        <div><div style={lbl}>Exploration · {explore < 34 ? "proven" : explore > 66 ? "experimental" : "balanced"}</div><input type="range" min="0" max="100" value={explore} onChange={(e) => setExplore(+e.target.value)} style={{ width: "100%", accentColor: ACCENT }} /></div>

        <div><div style={lbl}>Direction for this one (optional)</div><input value={nudge} onChange={(e) => setNudge(e.target.value)} placeholder="e.g. Emirates A380, dusk, packed grandstand" style={{ ...sel, boxSizing: "border-box" }} /></div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={generate} disabled={loading} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>{loading ? "Writing…" : "Generate prompt"}</button>
          <button onClick={() => setShowLearn((s) => !s)} style={{ ...ghostBtn, color: MUTE }}>{showLearn ? "Hide" : "How learning works"}</button>
          {history.length > 0 && <button onClick={clearAll} style={{ ...ghostBtn, color: MUTE, marginLeft: "auto" }}>Reset memory</button>}
        </div>

        {showLearn && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", background: "#fff", fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>What this actually does</div>
            <p style={{ margin: "0 0 10px" }}>It does not retrain Claude. Each Generate pastes your scored reach results, winning prompts, and notes into the message sent to Claude, so it leans toward what scores. Only items you have scored count — items still awaiting a result or marked unusable are excluded. This is the exact text attached next:</p>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", fontSize: 11.5, background: SCREEN, color: SCREEN_TX, padding: "12px 14px", borderRadius: 9, margin: 0, maxHeight: 300, overflow: "auto" }}>{ctxPreview || "No scored reels yet. Score a few and your winners, scoreboard, and notes appear here and steer the next prompt."}</pre>
          </div>
        )}

        {error && <div style={{ color: BAD, fontSize: 13 }}>{error}</div>}

        {history.length > 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
              {[["toscore", "To score"], ["scored", "Scored"], ["skipped", "Skipped"], ["all", "All"]].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{ borderRadius: 20, padding: "5px 13px", fontSize: 12.5, cursor: "pointer", fontWeight: filter === id ? 600 : 400, border: `1px solid ${filter === id ? ACCENT : LINE}`, background: filter === id ? "#FBEADF" : "#fff", color: filter === id ? ACCENT : INK }}>{label} {counts[id] || 0}</button>
              ))}
            </div>
            {view.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTE, padding: "6px 0" }}>{filter === "toscore" ? "Nothing waiting — generate a prompt and it lands here until you log how it did." : "Nothing here yet."}</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {view.map((h) => {
                  const m = statusMeta(h);
                  const open = cur && cur.id === h.id;
                  const waiting = (h.status === "queued" || h.status === "posted") && daysSince(h) >= 3;
                  return (
                    <button key={h.id} onClick={() => openEntry(h)} style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${open ? ACCENT : LINE}`, background: open ? "#FBEADF" : "#fff", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, display: "block" }}>{h.scenario}{h.hook ? " · hook" : ""}{h.multiShot ? " · multi" : ""}</span>
                        <span style={{ fontSize: 12, color: MUTE, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title || snippet(h.text)}</span>
                      </span>
                      <span style={{ fontSize: 11, textAlign: "right", flexShrink: 0, color: waiting ? "#B07A0B" : MUTE }}>
                        <span style={{ display: "block", color: m.color, fontWeight: 600 }}>{m.label}</span>
                        <span>{ago(h)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {current && (
          <div style={{ background: SCREEN, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#8d887b" }}>{current.scenario}{current.hook ? " · hook" : ""}{current.multiShot ? " · multi-shot" : ""}</span>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: over ? "#ff8a6b" : "#7fc59c" }}>{count} / 1500</span>
                <CopyBtn text={current.text} style={{ background: "transparent", border: `1px solid #46443c`, color: SCREEN_TX, borderRadius: 7, padding: "4px 10px", fontSize: 12, cursor: "pointer" }} />
                <button onClick={() => setCurrent(null)} style={{ background: "transparent", border: "none", color: "#8d887b", fontSize: 16, cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
              </span>
            </div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12.5, lineHeight: 1.7, color: SCREEN_TX, whiteSpace: "pre-wrap" }}>
              {sections.map((s, i) => <div key={i} style={{ marginBottom: i < sections.length - 1 ? 12 : 0 }}><span style={{ color: ACCENT, fontWeight: 600 }}>{s.label}</span>{s.body}</div>)}
            </div>
          </div>
        )}

        {current && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <div style={lbl}>Title</div>
              <button onClick={regenerateTitle} style={{ ...ghostBtn, padding: "5px 11px", fontSize: 12.5 }}>New title</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <div style={{ flex: 1, fontSize: 15.5, fontWeight: 600, minWidth: 0 }}>{current.title || "—"}</div>
              <CopyBtn text={current.title || ""} style={{ ...ghostBtn, padding: "7px 12px", fontSize: 12.5, flexShrink: 0 }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{current.filename || "—"}</code>
              <CopyBtn text={current.filename || ""} style={{ ...ghostBtn, padding: "7px 12px", fontSize: 12.5, flexShrink: 0 }} />
            </div>
          </div>
        )}

        {current && cur && cur.status === "skipped" ? (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: MUTE }}>Marked unusable — excluded from learning.</span>
            <button onClick={() => updateEntry({ status: "queued" })} style={ghostBtn}>Restore to queue</button>
          </div>
        ) : current ? (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>How did it do on Facebook?</div>
              <div style={{ fontSize: 12, color: MUTE }}>{cur && cur.status === "posted" ? `Posted · ${ago(cur, true)}` : cur && cur.status === "scored" ? "Scored — re-tap to change" : `Created ${ago(cur || current, true)}`}</div>
            </div>
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 10 }}>A comment teaches it most ("blended nose got huge comments", "crowd too thin"):</div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What happened with this one…" rows={2} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13.5, background: "#fff", color: INK, boxSizing: "border-box", resize: "vertical", marginBottom: 12, fontFamily: "inherit" }} />
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 7 }}>Illusion check (optional):</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {ILLUSION_TAGS.map((t) => <button key={t} onClick={() => toggleTag(t)} style={{ borderRadius: 20, padding: "6px 13px", fontSize: 12.5, cursor: "pointer", border: `1px solid ${pickedTags.includes(t) ? BAD : LINE}`, background: pickedTags.includes(t) ? "#F6E4E1" : "#fff", color: pickedTags.includes(t) ? BAD : INK }}>{t}</button>)}
            </div>
            <div style={{ fontSize: 12, color: MUTE, marginBottom: 7, fontWeight: 600 }}>Log the result:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {REACH.map((r) => { const on = cur && cur.reach === r.id; return <button key={r.id} onClick={() => updateEntry({ reach: r.id, status: "scored" })} style={{ flex: "1 1 auto", minWidth: 90, borderRadius: 9, padding: "10px 12px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${r.color}`, background: on ? r.color : "#fff", color: on ? "#fff" : r.color }}>{r.label}</button>; })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              {cur && cur.status !== "scored" && <button onClick={() => updateEntry({ status: "posted", postedAt: (cur && cur.postedAt) || Date.now() })} style={ghostBtn}>Mark as posted</button>}
              <button onClick={() => updateEntry({ status: "skipped" })} style={{ ...ghostBtn, color: MUTE }}>Couldn't use this one</button>
            </div>
          </div>
        ) : null}

        {!current && !loading && history.length === 0 && <div style={{ fontSize: 13, color: MUTE, lineHeight: 1.6, padding: "8px 0" }}>Set your levers and generate. Each prompt drops into the queue as "awaiting result" — copy it, post the reel, then come back any time, open it from the list, and log how it did. Scoring no longer has to happen in one sitting.</div>}
      </div>
    </div>
  );
}

const lbl = { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: MUTE, fontWeight: 600, marginBottom: 7 };
const sel = { width: "100%", padding: "9px 11px", border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 14, background: "#fff", color: INK };
const ghostBtn = { background: "#fff", color: INK, border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 15px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" };

function cleanTitle(t) {
  if (!t) return "";
  let s = t.split("\n")[0].trim();
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  s = s.replace(/[\\/:*?"<>|]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 90) s = s.slice(0, 90).trim();
  return s;
}
function toFilename(t) {
  let s = (t || "clip").replace(/[\\/:*?"<>|]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
  if (s.length > 60) s = s.slice(0, 60);
  s = s.replace(/_+$/, "");
  return (s || "clip") + ".mp4";
}
function copyText(s) {
  s = s || "";
  const fallback = () => { try { const ta = document.createElement("textarea"); ta.value = s; ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch (e) {} };
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s).catch(fallback); } else { fallback(); } } catch (e) { fallback(); }
}

function CopyBtn({ text, style, label }) {
  const [done, setDone] = useState(false);
  return <button onClick={() => { copyText(text); setDone(true); setTimeout(() => setDone(false), 1300); }} style={style}>{done ? "Copied" : (label || "Copy")}</button>;
}

function statusMeta(h) {
  if (h.status === "scored") { const r = REACH.find((x) => x.id === h.reach); return { label: r ? r.label : "Scored", color: r ? r.color : GOOD }; }
  if (h.status === "posted") return { label: "Posted", color: ACCENT };
  if (h.status === "skipped") return { label: "Skipped", color: MUTE };
  return { label: "Awaiting", color: WAIT };
}
function daysSince(h) { const base = h.postedAt || new Date(h.ts).getTime(); return Math.floor((Date.now() - base) / 86400000); }
function ago(h, posted) {
  const base = posted && h.postedAt ? h.postedAt : new Date(h.ts).getTime();
  const d = Math.floor((Date.now() - base) / 86400000);
  const pre = posted ? "" : "";
  if (d <= 0) return pre + "today";
  if (d === 1) return pre + "1 day ago";
  if (d < 7) return pre + d + " days ago";
  const w = Math.floor(d / 7);
  return pre + w + (w === 1 ? " week ago" : " weeks ago");
}
function snippet(text) { const i = text.indexOf("Visual:"); const s = (i > -1 ? text.slice(i + 7) : text).trim(); return s.slice(0, 80) + (s.length > 80 ? "…" : ""); }
function groupScenarios() {
  const order = ["", "Flight", "Water", "Incident", "Ground"];
  const map = {};
  SCENARIOS.forEach((s) => { (map[s.group] = map[s.group] || []).push(s); });
  return order.filter((g) => map[g]).map((g) => [g, map[g]]);
}
function splitSections(text) {
  const out = [];
  ["Visual:", "Audio:", "Negative:"].forEach((label, i, arr) => {
    const start = text.indexOf(label);
    if (start === -1) return;
    let end = text.length;
    for (let j = i + 1; j < arr.length; j++) { const n = text.indexOf(arr[j]); if (n > -1) { end = n; break; } }
    const body = text.slice(start + label.length, end).trim();
    out.push({ label, body: body ? " " + body : "" });
  });
  return out.length ? out : [{ label: "", body: text }];
}
