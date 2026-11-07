---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: []
---

---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: []
---

# AimDial - surface brief: the calibration run

<!-- impeccable:surface-brief 1 -->

## Scope

Every shipped surface of AimDial: the setup/home page, the in-run log screen, the
result report, and the persistent chrome (header, footer, dial motif). The play
drill happens inside Valorant's own range, not in this app, so there is no
canvas surface in scope.

## Visitor mode

Operate. The visitor completes a task: enter two numbers, write down a kill
count after each bot run, read a recommendation. Brand lives in precise details,
not in expression.

## Audience, job, task

A Valorant player who suspects their sensitivity is off but has no language for
it. They open this on a phone mid-session, alt-tabbed out of the game. The task
is short and repeated, and they are tired, so the surface has to do three things
without being read twice: name the exact number to type into the game right now,
take a kill count without a keyboard duel, and answer "was this worth it" when
they finish.

## Constraints

- Every fact, threshold, and sentence of product truth stays: the calibrated step
  ladder, the interleaved confirmation, the +1 kill gate, the two modes, the end
  reasons, the draft/undo/finish lifecycle, localStorage restore, keyboard and
  screen-reader operability.
- The algorithm modules and their tests are untouchable. No new dependency, no
  backend, no environment variables, no runtime network calls.
- No official Valorant artwork, logo, agent portrait, or map image ships. The
  game enters only as authored SVG vocabulary (crosshair, compass ring, spray
  plot, target spheres) at the level of an instrument part.
- The person in the scene is alone at night, one monitor lit, playing a tactical
  shooter whose own interface is dark with bright data on top.

## Chosen direction and memorable moment

A **night-sky chart for aim**: deep ink ground, chalk-white data, brass-gold
construction lines, and a single signal red reserved for the number to type and
the player's own position. Every panel is a plate on that ground rather than a
card on paper. The memorable moment is the Dial: drawn as an astrolabe, its ticks
and constellation marks placed on a real graduated scale, with the tested
settings hanging off it as stars.

## Unresolved decisions

None. Density, vocabulary level, and the no-official-art rule are settled.

## Direction contract

THESIS: A measuring instrument read like a star chart — the run's settings are
positions on a graduated scale, and the player's own value is the one red star.
It refuses the category default of a soft neutral app card stack.

OWN-WORLD: Deep ink ground (#0b0e14 to #131822), chalk data (#e8e4d8), brass
construction lines (#8a7340 / #c9a961), signal red (#ff4655) used only for the
actionable number and the player's own mark, teal (#3fd0c9) only for a confirmed
result. Type: a grotesque for prose, a wide-tracked mono for every measured
value and micro-label. Plates bounded by 1px brass hairlines with corner ticks,
never rounded cards. Sparkline-grade grid texture at very low opacity.

STORY: The player learns their sensitivity has a measured position among the
population, sees the exact number to type, and trusts it because the evidence is
drawn, not asserted.

FIRST VIEWPORT: Header rail with wordmark, mode tabs, step meter. Left: the
headline and the mode choice as two angular plates. Right: the hero number input
at display scale with its tick row. Below the fold the same ground continues into
the method figures. Primary action is a single red plate under the entry column.

FORM: grounded direction 6 of 7 (celestial star atlas), raised by the Crouwel
grid discipline (visible construction grid) and the signage terminal's
one-message-per-band hierarchy.

seed: 1aa456c666602653

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
