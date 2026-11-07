# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Valorant players who suspect their in-game sensitivity is off. They do not have the language for it — they cannot say "my eDPI is 288 but I overflick past the wall" — and the community advice they find ("just lower it") is a guess. They use this on a phone or a second monitor while the game is open, between rounds or after a session when they have 10–20 minutes to spare. Some are returning after a long break and no longer trust the value they set two years ago.

## Product Purpose

AimDial finds the sensitivity a player actually performs best at, using the player's own in-game range results rather than a generic recommendation. Success means the player finishes with one number they can type into the game, and evidence they can see for why it beat the one they were using.

## Positioning

The measurement happens in the game itself against the real 30-bot medium range, not in a browser drill that approximates aim. That makes the result a real comparison plus a statistically honest decision rule — an outside candidate must beat the incumbent in both halves of an interleaved repeat by at least one kill on average — rather than a score on a synthetic canvas. A browser aim trainer cannot truthfully claim this, because its own game feel is not Valorant's.

## Operating Context

- The player leaves the browser, changes resolution-free settings inside Valorant, runs the medium range with 30 bots, and comes back to record a kill count between 0 and 30. One round is one bot run.
- Rounds are short and repeated; a full calibration takes roughly 12–15 recorded rounds when refining a known value, and 19 when discovering one from scratch.
- The phone is usually the device in hand while the game holds the screen; the app must be usable with one thumb.
- DPI, weapon, position, armour, and shooting style must stay constant across the run; the app reminds the player once and does not police it.
- Progress is saved to the current browser as each value is typed, so a crash, a reload, or a resumed session never loses a run.

## Capabilities and Constraints

- Input: mouse DPI, plus the current in-game sensitivity **in refine mode only**. The two modes are separate searches, not two label variants:
  - **refine** — the player has a value they roughly trust. The sensitivity is required and the ladder is anchored on it, so every rung is a small move from their own number. If an outside rung wins a full repeat, the premise is wrong: the run stops early (`runaway`) and points at discovery rather than crawling across the ladder.
  - **discover** — the player has no trustworthy value. No sensitivity is asked for at all. The run sweeps 7 rungs symmetrically around the 250-eDPI population centre (94–662 eDPI), then re-anchors the fine ladder on the sweep winner and refines from there.
- The step ladder is calibrated in **hand movement, not percentage**: each rung is a fixed distance of the 360° turn (3.9 cm at the 250-eDPI anchor, then 2.0 → 1.0 → 0.5 cm; ≈4.4 cm median for a real player), so the step expressed as a ratio shrinks as eDPI rises (≈±20% at 0.150, ≈±3.2% at 0.400). A fixed ratio was rejected on measured evidence: across the 540 published pro setups tracked by ValorantHub (median 240 eDPI, p25 192, p75 280, checked 2026-10-27), the old ×1.25 step was 10.9 cm of 360 at the median player and 16.3 cm at p90 — beyond what any player feels as one step. The fixed-distance ladder puts 94% of that population inside a 2–8 cm first step, against 12% before. Values are quantised to three decimals, the game's own resolution. Duplicate brackets collapse; brackets that quantise to zero are dropped; the first step is capped at 25% for setups far below the band.
- An outside candidate that leads on the first screen is confirmed by an interleaved repeat of three pairs (six rounds), with the opening setting flipping every pair (ABBA then BAAB), and is promoted only if it wins **every** pair and averages at least one kill more. Three pairs rather than two halves the chance of a false move at realistic noise levels.
- If no outside candidate leads, the step narrows by half and the search continues around the last confirmed value. The run ends on plateau, resolution exhaustion, ceiling (every bracket at 29–30 kills), floor (every bracket at 0–1), edge (outside the playable eDPI range), runaway (the band will not stop improving and needs a fresh start), or a manual stop.
- A full calibration takes roughly 12–15 rounds in refine mode and 19 in discovery; the ladder is four rungs deep, so more steps are taken and each is a smaller, more honest move.
- All data lives in the browser's localStorage; there is no account, no server, no cross-device sync, and no write into the game's configuration.
- Pure static Vite/React deployment (Vercel). No backend, no environment variables.
- The app never displays cm/360° or eDPI to the player: they are internal references and do not help most players.

## Evidence on Hand

- Real recorded run data from the author's own calibration sessions, stored under the `aimdial.data.v2` localStorage key (history entries carry `sensitivity`, `score`, `runs`, `decisions`).
- The reference footage `tmp/aimlab_tb 2026-11-06 03-53-46.mp4` and `tmp/reference-12.png`: a real Aim Lab Sixshot recording used only to model the disconnected practice canvas, not the shipped flow.
- **The pro roster** (`src/lib/prosData.js`): 540 published pro setups captured from ValorantHub on 2026-11-07 (name, team, country, DPI, in-game sensitivity). Used only as *reference*: the result page places the player's eDPI among them and names the nearest players. It is not a target, and the copy says so — a pro's number belongs to a different hand, pad and role. Individual rows are community-collected and may lag a player's current setup, so the file is only sound for the shape of the distribution, which is all it is used for. eDPI is derived at runtime, never stored, so it cannot drift from the sourced pair.
- No user testimonials, benchmarks, or comparative claims exist beyond the above. Future work must not invent them, and every performance number shown must be computed from the player's own recorded rounds.

## Product Principles

1. One number, earned by evidence. The result is a specific sensitivity with the comparison that produced it, never a score or a vibe.
2. Doubt is designed in. A single good round never moves the recommendation; the rule is written so an unlucky player keeps what they had.
3. The game is the instrument. Anything that measures aim happens inside Valorant; the app orchestrates, records, and reasons.
4. Never lose a round. Every committed value is persisted as it is typed, and undo exists because typos happen mid-session.
5. Say what the player must do next, in their words, at the size of the value they have to type.

## Accessibility & Inclusion

- The interface is keyboard operable end to end, with visible focus, and it never traps focus.
- Every state is announced: current run, save status, errors, and the result are exposed to screen readers; colour is never the only carrier of meaning.
- Tap targets are at least 44×44 CSS pixels, since the primary device is a thumb on a phone.
- No sound or motion is required to complete the task; animation is a courtesy that respects `prefers-reduced-motion`.
