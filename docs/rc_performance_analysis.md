# RC Scale Aircraft — Facebook Reels Performance Analysis
### Input for Prompting Engine Optimization

**Data basis:** ~110 video thumbnails with all-time view counts, all from the page's own catalog. Self-reported as all-time (durable signal, not recency-biased) and 100% first-party. Treat every pattern below as a validated audience preference, not a hypothesis.

**Purpose:** Convert observed performance into weightings and rules the prompting engine can apply to generate higher-ceiling video prompts.

---

## 1. Headline Findings

1. **Real airline liveries are the single strongest lever.** Every video in the 2M+ tier is a recognizable commercial airliner in real-world livery. Military jets and warbirds have a hard lower ceiling by comparison.
2. **The down-the-runway centerline shot is the highest-ceiling composition** (top performer 7.9M; also 1.1M, 294K, 26K). It is currently not a codified template and should become one.
3. **The rotation moment — nose up, gear still extended — is the recurring hero frame** across the entire 1M–3M band.
4. **Tarmac beats grass** at the top end. Grass performs but skews mid-tier.
5. **Widebodies and large narrowbodies outperform** small sport jets, props, and warbirds for peak reach.
6. **Ambiguous-scale distant approach shots** (3.8M, 3.7M) are the reveal/debate-bait engine — they deliberately hide scale, which is the opposite of the standard "scale anchor from frame one" rule.

---

## 2. Tier Breakdown by View Count

### Breakout tier (2M+)
Dominated almost entirely by commercial airliners in real liveries, shot on tarmac, captured at takeoff rotation or on a centerline runway line.
- 12M — commercial airliner takeoff, tight low runway angle
- 7.9M — down-the-runway centerline, airliner departing away from camera
- 3.8M / 3.7M — distant approach, scale ambiguous (reveal-friendly)
- 3M — 747-class airliner rollout, side angle
- 2.9M (×2), 2.7M, 2.4M (×2, incl. "Air Force One" VC-25), 2.2M, 2M (×several) — airliner takeoffs/landings, tarmac

### Strong tier (1M–2M)
Still airliner-heavy; introduces the first strong military/large-transport entries.
- Airliners: A380, 747, 757, A320-family in Ryanair, Emirates, Qantas, ANA, Thai, KLM, LAN, Singapore, American, Air Canada, British Airways liveries
- Notable non-airliner performers: C-17 centerline (1.1M), F-16 (1.2M), B-2 (1.5M), VC-25 "Air Force One" (1.2M)

### Mid tier (200K–900K)
Wider variety of aircraft and surfaces; grass strips appear more often here; more sport jets and props; military more common.

### Lower tier (<200K)
Small sport aircraft, less recognizable liveries, grass fields, and steady taxi shots without a rotation or centerline payoff cluster here.

---

## 3. Variable-by-Variable Weighting Guidance

### Livery (strongest single factor)
**Weight generation heavily toward real, recognizable commercial airline liveries.**
- Tier-1 pool (lead with these): Delta, United, Qatar, Singapore Airlines, Ryanair, Emirates, Qantas, ANA, Thai Airways, KLM, LAN, American, Air Canada, British Airways
- Special case: "Air Force One" VC-25 livery performs in the breakout tier (2.4M, 1.2M) — keep in rotation as a high-value novelty
- Military/warbird: lower ceiling. Keep for variety and category coverage, but do not lead with it. Exceptions that reach 1M+ tend to be iconic airframes (F-16, B-2, C-17).

### Camera composition (ranked by ceiling)
1. **Down-the-runway centerline** — aircraft moving toward or away from camera along the runway line, growing/shrinking in frame. Highest ceiling. *Codify as a dedicated template.*
2. **Rotation moment** — low side/three-quarter angle, nose up, gear still down. The hero frame of the 1M–3M band.
3. **Low three-quarter takeoff/landing on tarmac** — reliable workhorse composition.
4. **Distant ambiguous-scale approach** — deliberately hides scale; the reveal/debate-bait engine. Break the "scale anchor from frame one" rule here on purpose.

### Surface
- Tarmac runway: top-tier ceiling. Bias toward it for reach-focused posts.
- Grass strip: performs, but skews mid-tier. Use for variety, not for breakout attempts.
- Apply existing surface-physics rules regardless (tarmac = clean roll, grass = bumpy).

### Aircraft type / size
- Widebodies (A380, 747) and large narrowbodies (757, A320 family): highest ceiling.
- Small sport jets, props, trainers: mid-to-lower tier. Good for volume and variety.

### Phase of flight
- Takeoff rotation and landing touchdown outperform steady taxi.
- The moment of gear-still-down rotation is the most repeated high performer — prioritize prompts that land on that instant.

---

## 4. Recommended Engine Changes

1. **Add a livery pool** with tier-1 airlines weighted highest, VC-25 as a novelty slot, military as a lower-weight variety slot.
2. **Add a camera-move pool** and insert the down-the-runway centerline shot as a first-class option, weighted high.
3. **Bake in surface bias** (tarmac-favored for reach posts) while keeping surface-physics rules intact.
4. **Bake in type bias** toward widebody/large-narrowbody for reach posts.
5. **Add a phase-of-flight bias** toward rotation/touchdown over taxi.
6. **Preserve the reveal exception:** for debate-bait/reveal concepts, override the scale-anchor rule and generate distant ambiguous-scale framing.
7. **Keep anti-repetition intact:** the variety in the mid-tier is healthy for the feed; the weightings above bias the *ceiling attempts*, not every single post.

---

## 5. Open Questions / Data Gaps

To tighten weightings further, useful next inputs would be:
- **Watch-through rate** per video (view count rewards the thumbnail/hook; watch-through rewards the composition — the two may rank differently).
- **Comments-per-reach** per video (the stated north-star metric — reach ceiling and engagement ceiling may favor different formats).
- A larger military/warbird sample to confirm whether the ceiling is truly lower or just under-sampled.
- Whether any top performers were boosted/paid vs. organic.

---

*Prepared as a machine-readable input. Section 3 and Section 4 are the parts to feed the engine as rules; Sections 1–2 are the supporting evidence.*
