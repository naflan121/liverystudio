# CliffDrop — Scenario Pack for the Scale-illusion Prompt Lab

Everything needed to add CliffDrop as a third scenario alongside *Ramp glide & splash* and *Runway takeoff*, with 35 prompts' worth of learning pre-seeded so the playbook doesn't have to rediscover it.

---

## 1. How it maps onto the existing UI

| Lab field | CliffDrop behaviour |
|---|---|
| **SCENARIO** | New entry: `CliffDrop — released from height, dead-stick glide` |
| **AIRCRAFT** | Same `[MODEL NAME]` placeholder. Pool in §5. |
| **CROWD DENSITY** | Repurposed — see §4. "Busy flightline" doesn't apply; CliffDrop has a launch party up top and a receiving group below. |
| **ENVIRONMENT** | Draws from the **launch structure** pool (§3), not lakeside/festival settings. |
| **CAMERA IDENTITY** | **Must not be "Let Claude decide."** CliffDrop has one geometry. Three permitted variants in §6. |
| **Multiple shots / angles** | **Force OFF and grey out.** Single unbroken take is load-bearing for this scenario. |
| **Punchy 3-sec open** | Leave available but the scenario already specifies its own opening (drone descending past the parapet, aircraft in hand). If ticked, it should sharpen that moment, not replace it. |
| **Hook mode** | Compatible. The impossible detail should be the *airframe choice* (Spruce Goose, Caproni, Bartini) rather than a physics anomaly — physics anomalies break the illusion in this format. |
| **OPERATOR REGION** | Works as-is. Also gates environment: Emirates → desert/salt flat, KLM → dyke/bridge, BA → chalk cliff/gorge. |
| **Reach Boost** | Different biases from the runway scenarios. CliffDrop's reach factors: recognisable widebody, structure filling the background, hard midday light. Not tarmac/rotation. |
| **Long prompt (4800)** | **Force ON.** See §9 — CliffDrop won't fit 1500 without a compressed variant. |

---

## 2. Scenario block (injectable text)

This is the text the generator injects when CliffDrop is selected.

```
SCENARIO — CLIFFDROP

A group of people release a large foam-and-plastic scale airliner from a high
structure. It has no power. It falls, recovers into a flat dead-stick glide, runs
out across the landscape a few metres up, and puts down on a surface that produces
a visible payoff — spray, dust, gravel, crop, salt. One drone films the whole thing
in a single unbroken take from the aircraft's flank.

The tension is: it has no engines and it is very high up, and it lands intact.

Structure of every clip:
1. LAUNCH (0–3s) — drone descending past the launch point, level with the aircraft,
   square to its left side. Four people holding it. Livery clearly readable.
2. RELEASE + FALL (3–7s) — straight push along the nose's existing heading. Nose-low
   drop, structure face ripping upward past the background as a speed reference.
3. GLIDE (7–14s) — nose lifts, flat glide, drone tracks alongside in a straight line.
   Ground detail and people always in frame behind the aircraft.
4. PAYOFF (14–18s) — contact with the landing surface, visible plume/spray/scatter,
   straight slide, settles upright and intact, people running in.

Target duration 15–20 seconds.
```

---

## 3. ENVIRONMENT pool — launch structures

The environment is a **structure with a drop under it**. It must be tall enough that the ground is out of frame at the start, and textured enough to give the fall a speed reference.

**Used already (mark as covered so `Vary using coverage` steers off them):**

| Structure | Landing surface | Status |
|---|---|---|
| Road bridge over water | Water splash | **Proven winner (KLM 747)** |
| Road bridge over wooded gorge | Gravel river bar | Untested |
| Dam wall | Water | Used |
| Chalk sea cliff | Beach shingle | Used |
| Quarry face / quarry tower | Quarry floor | Used |
| Cooling tower rim | Grass overrun | Used |
| Grain silo / grain elevator | Crop field | Used |
| Water tower | Grass | Used |
| Stone viaduct | Field, hedge | Used |
| Dock gantry crane | Dock water | Used |
| Wind turbine nacelle | Farmland | Used |
| Stadium roof lip | Pitch | Used |
| Hangar roof ridge | Apron | Used |
| Shipyard gantry | Slipway water | Used |
| Radio mast platform | Scrub | Used |
| Desert highway flyover stub | Salt flat | Untested |

**Unused — feed these in first:**

- Multi-storey car park top deck → flooded lower lot
- Motorway service bridge → motorway verge (no traffic in frame)
- Ski lift pylon / gondola station → snowfield
- Lighthouse gallery → tidal sand
- Open-cast mine haul road bench → mine floor
- Refinery flare stack walkway → gravel yard
- Castle curtain wall → moat / dry ditch
- Railway trestle → riverbed
- Container stack top tier → dock apron
- Reservoir intake tower → reservoir
- Sand quarry conveyor gantry → sand pile
- Highland crag with hikers → peat bog
- Airport control tower balcony → grass infield (self-referential, strong)

**Environment must supply, in every case:**
- A textured vertical face for the fall (joints, staining, panel lines, brick courses)
- A safety rail or parapet the crew work over
- A landing surface that visibly displaces on contact
- 8–15 people below, plus 2–3 vehicles, as scale anchors

---

## 4. CROWD DENSITY — redefined for CliffDrop

Not a flightline. Two separate groups:

| Setting | Launch party (top) | Receiving group (below) |
|---|---|---|
| **Sparse** | 4 carrying + 1 transmitter | 4–6 people, 1 vehicle |
| **Standard** *(default)* | 4 carrying + 1 transmitter + 2 watching | 8–12 people, 2 vehicles |
| **Event** | 4 carrying + 1 transmitter + 6–8 watching, phones up | 20+ spread along the landing area, 3–4 vehicles, a marquee |

**Rule that overrides the setting:** people or ground detail must be visible behind the aircraft in *every frame of the glide*. Never framed against open sky. This is the single biggest cause of scale drift to full-size.

---

## 5. AIRCRAFT pool

**Tier 1 — recognisable widebody, painted livery. Highest reach.**
747-400 / 747-8 · 777-300ER · 787-9 · A380 · A350 · A330 · MD-11 · 767

**Tier 2 — recognisable narrowbody.**
737-800 · A320/A321 · E190 · ATR 72 · Dash 8

**Tier 3 — oddball hook aircraft.** Lower recognition, higher "what *is* that".
BelugaXL · Super Guppy · Dreamlifter · An-124 · An-225 · Concorde · Spruce Goose · Caproni Ca.60 · V-173 Flying Pancake · Bartini VVA-14 · An-2

**Tier 4 — warbirds / civil-marked military.**
Spitfire · P-51 · DC-3 · C-130 in firefighting or civil colours · C-17 in civil scheme

**Blocked:**
- **Bare polished aluminium** (American, older TWA/Braniff schemes) — renders as liquid chrome. Painted liveries only.
- **Modern combat jets, visible weapons, active-conflict association** — moderation refusals.
- **Air Force One / any head-of-state aircraft** — reads as an incident involving the President, monetisation risk.
- Aircraft whose type names trigger refusals (X-15 confirmed). If refused, drop the type name from the prompt entirely and let the reference image carry it. **Do not reword to evade the filter** — Facebook's classifiers run similar logic and a clip that needed evasion is a takedown candidate on a monetised page.

**Airline pairing rule:** always a real operator of that type, and the operator's home region should match the environment if OPERATOR REGION is set.

---

## 6. CAMERA IDENTITY — three permitted variants

All three keep the aircraft in left-side profile with the nose to frame-right. The camera is never above it. This is non-negotiable — four separate generations failed by the camera drifting above and the model rolling the aircraft to reconcile.

| Variant | Description | Use when |
|---|---|---|
| **A · Side track** *(default, proven)* | Drone descends past the launch point level with the aircraft, then tracks right alongside it in a straight line. | Default for everything. This is the winner's geometry. |
| **B · Static-to-track** | Drone holds a wide side-on framing at launch height as the aircraft falls *through* frame, then picks it up and tracks. Aircraft leaves frame briefly at the bottom. | Very tall structures where the fall is the story. Riskier — the reacquisition can fail. |
| **C · Descending flank** | Drone descends slightly faster than the aircraft during the fall, so the aircraft rises in frame, then equalises for the glide. | Adds drama to short drops. Never let the camera end up above. |

**Never permitted in this scenario:** chase-from-behind (that's the Ramp glide geometry), overhead, ground-level start, hovering, reverse angle, angle change mid-clip.

---

## 7. Locked constants — emit verbatim, never paraphrase

The generator should treat these as fixed blocks, not as text to rewrite each time. They exist because each one fixed a specific observed failure.

**FRAMING**
```
The drone stands far enough off that the whole airframe sits inside the frame from
nose to tail and wingtip to wingtip in the very first second and stays fully in frame
the entire way — never cropped, never clipped at the edges.
```

**DIRECTION LOCK**
```
The aircraft's nose points toward the RIGHT edge of frame in the very first frame and
continues pointing right in every frame until the last. It travels toward the right of
frame for the entire clip and never travels left, never toward the camera, never away
from the camera, never reverses, never flips, never yaws. Its heading is fixed from
first frame to last. It is seen in clean left-side profile throughout.
```

**CAMERA LOCK**
```
The drone flies formation off the aircraft's left flank, level with it and square to
its side, at the same height at all times. The camera is never above it, never below
it, never behind it, never ahead of it, and never looks down at it. The horizon sits
level across the middle of frame, not at the top. The camera is always moving in
smooth straight lines, first descending, then tracking right — never stationary, never
hovering, never drifting or correcting in place.
```

**SCALE / REFERENCE-IMAGE RULE**
```
The aircraft is exactly the one in the attached reference image — match its shape,
proportions, livery, colours and every marking precisely, and keep them identical in
every frame. It is built as a three-metre foam-and-plastic scale model, light enough
that four people carry it between them, one under each wing and two at the forward
fuselage. Its physical scale stays constant for the entire clip. Its engines are
silent and unpowered throughout.
```

**LAUNCH GEOMETRY**
```
They lift it over the rail and push it out — a straight push toward the right of
frame, along the direction the nose is already pointing, not sideways off the
parapet.
```

**Never describe livery, markings or colours in prose.** The seed image carries the aircraft. Text descriptions compete with the image and the text wins, wrongly. Prompt text carries only what an image cannot: physical size, carry-party size, unpowered state.

---

## 8. AUDIO module — radio-only

Current best version. All spoken audio arrives through handheld radios; compression and squelch mask synthetic voice artefacts, which is why this works.

```
All spoken audio in this clip comes through handheld radios only — compressed,
squelchy, thin and band-limited, with mic clicks and static bursts between
transmissions. There is no unfiltered speech anywhere in the clip.

OPEN: radio traffic already mid-sentence from below — "{GROUND_CALL}" — a click, and
a reply from the launch point — "{LAUNCH_CALL}". Around it: {AMBIENT}. Grunts of
effort and the rustle of it leaving their hands.

FALL + GLIDE: no speech except thin radio chatter, half swallowed by squelch, a few
clipped words — "{FLIGHT_CALL}" — with wind rush over the mic and the faint whistle
of the unpowered airframe underneath.

PAYOFF: {IMPACT_SOUND} — and the radio bursts into overlapping transmissions all at
once, clipped and stepping on each other, whooping and laughter compressed through
the squelch. One last transmission, closer to the mic: "{CLOSING_CALL}". No music.
```

Rules:
- **No engine sound, ever.** Jet roar, turbine, engine rumble always in Negative.
- Radio lines are texture, not script — short, clipped, half-finished.
- Non-speech crowd sound (boots, horns, clapping) may be unfiltered if the payoff feels muted with everything compressed. Words stay on radio.

---

## 9. Character budget and trim order

CliffDrop as written runs **~5,000 characters**. The activity log shows the rewrite pass overshooting (4801 against a 1500 counter), so this needs handling explicitly.

**Long mode (4800):** trim in this order until under budget —

1. Scene-setting adjectives in the environment paragraph
2. Secondary environment detail (parked vehicles, footbridge, driftwood) — keep at least three ground-detail items
3. Ambient audio detail
4. Redundant negatives (see the dedup list in §10)
5. Payoff description down to: contact, plume, straight slide, settles upright, people running in

**Never trim:** FRAMING, DIRECTION LOCK, CAMERA LOCK, the reference-image rule, the launch geometry line, or the "always ground detail behind it, never open sky" instruction.

**Short mode (1500) — compressed skeleton:**

```
Vertical drone footage, one continuous unbroken take, real-time speed, never slowed.
Whole airframe in frame nose to tail from the first second, never cropped.
Nose points RIGHT in every frame — travels right the whole clip, never left, never
toward or away from camera, never reverses, never flips, never yaws. Clean left-side
profile throughout.
Drone flies off its left flank, level and square to it, never above, never below,
never looking down. Horizon across mid-frame. Always moving — descending, then
tracking right. Never hovering.
Aircraft exactly as the attached reference image, identical every frame. Three-metre
foam-and-plastic scale model, four people carry it. Engines silent and unpowered.
{STRUCTURE}, bright clear late morning, hard sun. {LANDING_SURFACE} below with ten
people and two vehicles.
Opens mid-motion: drone descending past the rail, level with it, four people holding
it, nose right, a fifth with a transmitter. They push it straight out along the nose.
It drops nose-low, the structure face ripping upward behind. The nose lifts into a
flat glide; the drone tracks right alongside. People and ground detail behind it at
all times, never open sky. Shadow close beneath. It touches {LANDING_SURFACE} still
travelling right, {PAYOFF}, slides straight, settles upright and intact, people
running in as it ends.
Audio: radio only, compressed and squelchy, no unfiltered speech. Wind and airframe
whistle through the glide. {IMPACT_SOUND}, then overlapping radio whooping. No engine
sound, no music.
Negative: {CORE_NEGATIVES}
```

---

## 10. Negative library

**Core block — always emitted.** Ordered by observed failure frequency.

```
aircraft moving backwards, aircraft travelling left, reversing direction, direction
change, heading change, flipping around, 180-degree flip, yawing, nose swinging across
frame, nose toward camera, tail toward camera, head-on angle, rear angle,
three-quarter angle, flying away from camera, flying toward camera, thrown sideways
off the parapet, launch perpendicular to the nose, camera above the aircraft, high
angle, overhead view, bird's eye view, looking down on the aircraft, downward camera
tilt, horizon at top of frame, camera below the aircraft, camera behind it, camera
ahead of it, camera changing sides, ground level camera, camera starting on the
ground, hovering camera, stationary camera, camera holding position, camera drifting
in place, floaty camera motion, camera pausing mid-clip, aircraft hovering, aircraft
floating, weightless motion, gliding unnaturally smoothly, motion on rails, aircraft
rolling, banking, wing dropping, rotating about its long axis, belly toward camera,
aircraft cropped at the edge of frame, wingtips cut off, tail cut off, nose cut off,
aircraft framed against open sky, empty background behind the aircraft, no ground
reference, aircraft alone in frame, no people in shot, full-size aircraft, real
airliner proportions, aircraft growing in size, model changing size, differing from
the reference image, changed livery, changed markings, changed proportions, morphing
airframe, livery changing mid-clip, cut, cuts, hard cut, jump cut, edit, camera
teleporting, angle change mid-clip, scene change, static opening frame, frozen first
frame, posed shot, double shadow, two shadows, second aircraft, jet engine roar,
engines running, engine exhaust, powered flight, climbing away, gaining altitude,
turning in flight, curving flight path, loop, stall, nosedive, cartwheeling crash,
breaking apart, debris, wings snapping, explosion, fire, smoke, people struck by the
aircraft, cloned faces, duplicated spectators, evenly spaced crowd, watermark,
on-screen text, subtitles, CGI glow, cartoon, slow motion, speed ramp, freeze frame,
timelapse, overcast sky, rain, fog, night, golden hour, sunset, garbled speech
```

**Conditional add-ons by airframe** — the generator appends the row matching the selected aircraft:

| Aircraft class | Add |
|---|---|
| 747 | `no hump, flat forward fuselage, missing upper deck, single-deck fuselage, wrong engine count, two engines, three engines` |
| A380 | `single-deck fuselage, no upper deck windows, narrowbody proportions, two engines` |
| Twin widebody (777/787/A330/A350) | `four engines, three engines, one engine, engines on the tail, hump, double-deck fuselage, upper deck windows` |
| Narrowbody | `widebody proportions, twin-aisle fuselage, four engines` |
| Oddball (Beluga/Guppy/Ca.60) | `conventional airliner shape, generic airliner fuselage, standard fuselage cross-section` |
| Warbird | `jet engines, modern airliner shape, tricycle undercarriage` |

**Conditional add-on when radio-only audio is used:**
```
unfiltered speech, clean voices, direct dialogue, shouting picked up by the camera,
crowd voices without radio compression, scripted dialogue during flight, continuous
commentary, clean studio speech
```

**Dedup note for the rewrite pass:** the negative block accumulated duplicates across 35 prompts (`slow motion` / `slow-mo`, `grey clouds` / `overcast sky`, several angle terms restated). Deduping saves roughly 300–400 characters with no behavioural loss.

---

## 11. Playbook seeds

Preload these so CliffDrop starts with 35 prompts of learning rather than at zero. Each is written as a lesson the digest can apply.

| # | Lesson | Origin |
|---|---|---|
| 1 | The seed image overrides prompt text every time. A seed shot from above-and-behind while the prompt asks for side-on makes the model roll the aircraft to reconcile. Seed must be side-on, level, nose right, horizon mid-frame, structure filling the background. | Qantas 787 rolled and flipped |
| 2 | An aircraft alone over open water or open sky loses all scale reference and renders full-size. Ground detail and people must be behind it in every frame of the glide. | Qantas 787 |
| 3 | Bare polished aluminium renders as liquid chrome. Painted liveries only. | American 777 |
| 4 | The word "hovers" anywhere in the prompt — even describing the opening — makes the camera hover for the whole clip. Remove all hover/stationary language from positive text. | BelugaXL |
| 5 | A launch described as a sideways push perpendicular to the nose gives the model no committed heading, and it flies backwards or flips. The push must run along the direction the nose already points. | Air France E170 |
| 6 | Camera drifting above the aircraft is the most frequent failure — four separate occurrences. The camera-above negatives and the explicit level-flank instruction are both required; neither alone is sufficient. | Recurring |
| 7 | Describing livery in prose while also passing a reference image produces contradictions. Text carries only physical size, carry-party size and unpowered state. | Standing rule |
| 8 | Prose outperforms timestamped beat lists. Timestamps create gaps the model fills with slow motion. | Winner analysis |
| 9 | Scripted crowd dialogue mid-flight reads as AI. Radio compression masks it. Best current version puts all speech on radio. | Audio iteration |
| 10 | The structure face ripping upward past the background during the fall is the primary speed cue. Without a textured vertical surface the fall reads as floating. | Standing rule |
| 11 | Bright clear midday light outperforms golden hour for reach on this format. | Performance |
| 12 | Refusals: do not reword to evade. Drop the type name and let the reference image carry it, or substitute an unflagged airframe with the same structure. | X-15 |

---

## 12. Illusion-check chip routing

Map the feedback chips to specific fixes so the digest knows what to change rather than rewriting blind.

| Chip | Most likely cause in CliffDrop | Fix to apply |
|---|---|---|
| **Scale drifted to full-size** | Lost ground detail behind the aircraft; crowd left frame | Strengthen the "people or ground detail behind it at all times" clause; increase crowd density one step; lower the glide height |
| **CGI / AI sheen** | Too-clean environment, symmetrical crowd | Add deliberate imperfections — crooked rail, uneven crowd spacing, mismatched vehicles, drifted sand, staining |
| **Wrong engine sound** | Engine audio leaked in | Verify unpowered clause present in positive text *and* engine terms in negatives; both are needed |
| **Floaty / kite physics** | Fall too slow, no speed reference | Strengthen the structure-face-ripping-upward line; add wing flex in buffet; shorten the glide, lengthen the fall |
| **Toy-like** | Model reads as small rather than as a convincing scale illusion | Check the seed frame proportions between pilot and aircraft; increase environment texture; avoid glossy surfaces |
| **Other** | — | Route to free-text digest |

---

## 13. Titles, filenames, captions

**Filename:** `LL{NNN}_CliffDrop_{AIRLINE-TYPE}_{Structure}_{CameraVariant}_{take}.mp4`
Example: `LL034_CliffDrop_BA-B747_GorgeBridge_SideTrack_01.mp4`

**Title pattern** (matches the lab's existing style):
`{Airline} {type} RC scale model dead-sticks from a {structure} to a {landing surface}`

**Caption:** unique caption plus up to five hashtags in one copy-paste block. Hooks that suit CliffDrop specifically: the no-engines angle, the height, and "real or fake" debate bait.

---

## 14. First runs once it's plugged in

Two decisions outstanding before this scales:

1. **No feedback yet on LL021–LL035.** Thirteen-plus prompts written since the last verified result. Unknown whether the direction lock fixed the flip, whether quiet-middle audio helped, and whether small or unrecognised aircraft hold attention. That matters more than any new airframe.
2. **LL034 (BA 747, gorge bridge) is a controlled test** against the KLM winner — same bridge structure, same type, different airline and landing. Run it early; the result tells you whether the setup is repeatable or whether something specific to the KLM clip did the work.

Suggested first batch through the engine: five generations, all Camera Variant A, all Tier 1 aircraft, five unused structures from §3. Get reach data before opening up Tier 3 airframes or Variants B and C.
