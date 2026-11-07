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

- Every fact, threshold, and sentence of product truth stays: the 1.25/1.12/1.06
  step factors, ABBA/BAAB confirmation, the +1 kill gate, the end reasons, the
  draft/undo/finish lifecycle, localStorage restore, keyboard and screen-reader
  operability.
- The algorithm modules and their tests are untouchable. No new dependency, no
  web font over the network (a phone in a game overlay is an offline-capable
  surface), light theme only - the surface is read on a phone within arm's reach
  of a lit monitor, and a dark page next to a bright game is the worse choice.

## Direction contract

THESIS: AimDial is a measuring instrument - its hero device is not a card but a
calibrated dial scale whose live marker tracks the sensitivity you are about to
type into the game. It refuses the category default: a dark card stack with neon
accents, chip rows, a toggle-group logo, and the hero-metric template.

OWN-WORLD: warm paper ground (#f3efe6) with a hairline grid, near-black ink
(#15130d), one signal red (#c8402a) reserved for the number you must act on, and
one teal (#0e6659) reserved for confirmed state. Instrument grammar: tabular
numerals at display scale, ruler ticks, calipers, a mono face for every measured
value, thin black rules instead of card borders, and section labels set as
calibrated marks with a subscript.

STORY: the visitor sees, in the first viewport, a dial whose marker already sits
at their current sensitivity; entering their number moves it and prints the exact
series of sensitivities to test. Through the run they type kill counts into a
one-tap keypad and watch a run ledger fill; at the end they read the confirmed
recommendation with the physical reason it won, then copy it.

FIRST VIEWPORT: a sticky instrument bar (calibrated AimDial wordmark, silent save
state, a step scale 01 Setup / 02 Test / 03 Result with the current step filled
in signal red) over a two-column instrument body. Left column, twice the width of
the right: a 260px-tall dial - log scale across the tested bracket, labelled
major ticks, a red live marker with a printed readout above it, a ghost outline of
the starting value behind it, and bracket marks over the three test settings.
Below it the readout strip prints start and the three candidate settings with
their exact three-decimal values. Right column: DPI and sensitivity entry styled
as instrument fields (no pills, no chips - preset values sit on a tick row under
the field), the derived size of the move, and one full-width signal-red primary
action in the column's flow.

FORM: committed in design instead of a dealt roll - the brief was a pin, and the
operate mode rules route app screens code-led. SEED REFERENCE:
`91eca2347e7f786b`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Memorable moment

The dial marker gliding to a new setting when a number is committed, and the run
ledger advancing: the app behaving like a device that is measuring you, not a
form that is recording you.

## Unresolved decisions

- None outstanding. Light theme and paper ground are committed; the drill canvas
  module stays disconnected from the shipped flow and is out of scope.
