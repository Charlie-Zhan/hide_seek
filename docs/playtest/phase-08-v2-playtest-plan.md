# Phase 08 V2 Playtest Plan

## Purpose

This plan records V2 objective and ambient event experiments only. These are the
source-level names for the product concepts of hider tasks and random events. It
must not be used to approve MVP behavior changes. Run this plan only when V2
flags are explicitly enabled in a test room.

Required setup:

- V2 flags are explicitly enabled only for the test room.
- `phase08V2Enabled=true` for the test room.
- `v2ObjectivesEnabled` and `v2EventsEnabled` recorded per run.
- MVP default rooms verified with V2 flags off before and after the experiment.

## Experiment Matrix

Run at least one session for each player count:

| Players | Seeker Count | Hider Count | Minimum Rounds | Notes |
|---|---:|---:|---:|---|
| 2 players | 1 | 1 | 2 | Confirms task pressure does not overwhelm a single hider. |
| 3 players | 1 | 2 | 3 | Checks whether events create fair uncertainty with two hiders. |
| 4 players | 1 | 3 | 4 | Main V2 balance reference. |

## Session Record Fields

Record these fields for every run:

```text
sessionId
date
buildId
mapId
players
roundCount
phase08V2Enabled
v2ObjectivesEnabled
v2EventsEnabled
objectiveSetId
ambientEventSetId
objectiveCompletionRate
objectiveAttemptRate
objectiveCausedCaptureRate
eventInterferenceScore
coreCaptureSurvivalScoreShare
optionalObjectiveScoreShare
eventScoreShare
weakenedObservationMemory
weakenedDisguiseReasoning
weakenedLimitedAttackPressure
mandatoryTaskRouteObserved
randomCaptureObserved
randomScoringObserved
serverAuthorityConcern
notes
decision
```

## Field Definitions

`objectiveCompletionRate`: completed objectives divided by eligible objective
opportunities.

`objectiveAttemptRate`: hiders who attempted at least one objective divided by
eligible hiders.

`objectiveCausedCaptureRate`: captures where the tester judges the objective
was the primary cause divided by all captures. Record the short reason in notes.

`eventInterferenceScore`: tester rating from 1 to 5.

- `1`: event was barely noticed.
- `2`: event added readable flavor.
- `3`: event changed decisions but remained fair.
- `4`: event frequently interrupted core reading.
- `5`: event made observation, disguise, or attack pressure feel unreliable.

`coreCaptureSurvivalScoreShare`: capture, all-capture bonus, and survival score
divided by total score. This should remain the dominant share.

`optionalObjectiveScoreShare`: optional objective score divided by total score.

`eventScoreShare`: event-granted score divided by total score. Expected value is
`0`; any non-zero value is a blocker unless a later spec explicitly changes the
scoring model.

`weakenedObservationMemory`: `yes` if objectives or ambient events made Preview
memory less important than following UI prompts or event hints.

`weakenedDisguiseReasoning`: `yes` if objectives or ambient events made
realistic prop placement less important than system effects.

`weakenedLimitedAttackPressure`: `yes` if objectives or ambient events made
attacks feel cheap, obvious, replenished, or less risky.

`mandatoryTaskRouteObserved`: `yes` if hiders felt forced to run objectives to
remain competitive.

`randomCaptureObserved`: `yes` if an event directly captured, revealed, selected,
or identified a hider.

`randomScoringObserved`: `yes` if an event directly awarded or removed score.

`serverAuthorityConcern`: `yes` if any completion, reward, event timing, event
area, capture, score, or round end appeared client-decided.

`decision`: one of `pass`, `retune`, or `reject`.

## Round Notes Template

```text
roundIndex:
seekerPlayerId:
hiderCount:
objectivesAvailable:
objectivesAttempted:
objectivesCompleted:
objectiveCaptures:
ambientEventsTriggered:
eventInterferenceScore:
captures:
survivors:
attacksUsed:
attacksRemaining:
coreScore:
objectiveScore:
eventScore:
mainObservation:
```

## Pass Criteria

A V2 experiment passes only if all are true:

- MVP default-off behavior is unchanged before and after the experiment.
- No random capture or random scoring occurred.
- No mandatory task route behavior was observed.
- `coreCaptureSurvivalScoreShare` remains higher than optional objective score
  share.
- Average `eventInterferenceScore` is 3 or lower.
- Testers answer `no` for weakened observation/memory, weakened disguise
  reasoning, and weakened limited attack pressure.
- No server authority concern is recorded.

Any failed item requires `retune` or `reject`; it cannot be accepted as a normal
variance note.
