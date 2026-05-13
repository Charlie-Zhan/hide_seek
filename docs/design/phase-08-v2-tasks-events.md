# Phase 08 V2 Tasks and Events Design Boundary

## Scope

Phase 08 is a V2 design and validation gate for optional hider tasks and random
events. In source and protocol names, these are implemented as objectives and
ambient events. It is not MVP scope. These systems must remain default off until
a later implementation phase explicitly enables a V2 experiment.

The MVP loop remains:

```text
Preview -> Hide -> Seek -> Result
```

The primary scoring loop remains seeker captures, all-capture bonus, and hider
survival. V2 objectives and ambient events may add risk decisions and readable
variation, but they must not replace memory, disguise, limited attacks, or
server-authoritative capture rules.

## Required Defaults

- `phase08V2Enabled` default: `false`.
- `v2ObjectivesEnabled` default: `false`.
- `v2EventsEnabled` default: `false`.
- Legacy draft names `v2TasksEnabled` and `v2RandomEventsEnabled` must not be
  used for runtime gates.
- Any future V2 config must include an explicit default-off flag before runtime
  behavior is wired.
- A room using MVP defaults must not spawn objective points, ambient event
  timers, objective rewards, event rewards, event captures, or event score
  changes.

## Server Authority

Objectives and ambient events must be server authoritative. Clients may render
prompts, progress, warnings, and effects, but clients must never decide
completion, rewards, event timing, event area, capture, score, or round end.

The server owns:

- V2 experiment flags for the room.
- Objective point selection and spawn state.
- Objective eligibility by phase, role, player, and round.
- Objective progress and completion.
- Optional objective reward grants.
- Ambient event scheduling, warning time, area, duration, and end state.
- Any event-driven prop movement or visibility modifier.
- Score deltas and match results.

Clients send only player intent. A future objective interaction input must be
treated like existing movement, prop switch, and attack inputs: legal only in
the current phase, legal only for the current role, rate limited, and validated
on the server.

## Allowed Objective Shape

V2 objectives are the implementation name for optional hider tasks. A hider may
ignore every objective and still play a valid round.

Allowed objective constraints:

- At most one completed objective per hider per round.
- Rewards must be smaller than, or clearly secondary to, capture/survival
  scoring.
- Objective locations must be readable from map context and should create a
  visible risk, such as lingering near a fixture or leaving a small clue.
- Objective progress must pause or fail cleanly when a hider leaves the area, is
  captured, or the round exits Seek.
- Objective completion must be observable or inferable by the seeker after the
  fact.

Examples that fit the boundary:

- Linger near a coin point for 2 seconds for a small optional reward.
- Repair a switch for 3 seconds with a brief visible cue.
- Push a small prop to a target zone where the map change is readable.
- Leave a small wall mark that creates a clue.

## Allowed Ambient Event Shape

Ambient events are the implementation name for random event concepts. They are
local, short, readable disturbances that create uncertainty for both sides
without deciding the round by themselves.

Allowed event constraints:

- At most 1 to 2 events per round in an enabled V2 experiment.
- Events must have a warning before impact.
- Events must have a short duration and clear end.
- Events must affect an area or known lane, not the whole match without warning.
- Events may change visibility, move neutral props, or add temporary visual
  clutter only if the effect is understandable and reversible.

Examples that fit the boundary:

- Brief light flicker with warning and short duration.
- Steam in one kitchen area.
- Cleaning robot nudging a small number of neutral props.
- Conveyor belt moving props on a visible lane.
- Grass rustle that does not identify players.

## Explicitly Forbidden

Phase 08 must not introduce these systems into MVP or V2 experiments:

- Seeker scan, scanner, radar, reveal, x-ray, extra vision, or hint abilities.
- Seeker sprint, dash, speed boost, charge, or mobility abilities.
- Hider roll, sprint, dash, attack, stun, or combat abilities.
- container hiding, cabinet entry, locker entry, closet entry, crate entry, or
  any interactive hide-inside-object mechanic.
- Mandatory task route running or objectives that force hiders to cross the map.
- Random capture, random reveal, random seeker targeting, or automatic player
  identification.
- Random scoring, event scoring, or any event that directly decides winner,
  loser, capture, survival, all-capture bonus, or round end.
- Paid progression, ranked progression, seasons, or power growth.
- P2P networking.

## Scoring Guardrail

Every V2 experiment report must compute:

- Core capture/survival score share.
- Optional objective score share.
- Event-caused score share, expected to remain `0`.

The target is that core capture and survival remain the main source of score.
If optional objective points become the dominant score source, the experiment
fails.

## Product Judgment Gate

Before implementation or tuning, answer these questions:

- Does it make the seeker rely less on Preview memory and map observation?
- Does it make disguise placement less important?
- Does it reduce the pressure of limited attacks?
- Does it force hiders to run tasks instead of making a risky optional choice?
- Can the server fully validate the outcome without trusting the client?
- Does the MVP default stay unchanged when all V2 flags are false?

Any "yes" answer for the first four questions blocks the change. A "no" answer
for either server authority or default-off behavior blocks the change.

## Acceptance Gate

Phase 08 is accepted when:

- This design boundary exists and states V2/default-off behavior.
- The playtest plan records 2, 3, and 4 player V2 experiment fields.
- `npm run validate:phase08` exists and passes.
- The validator checks required docs, package script, current default-off source
  gates, concrete protocol types, core terms, default-off clues, and forbidden
  implementation terms in client/server/shared sources.
- No client, server, shared, test, or implementation files are changed for Phase
  08.
