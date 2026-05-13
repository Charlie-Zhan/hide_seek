# Phase 07 Balance Playtest Template

Scope: record 2/3/4 player MVP balance data only. Do not add skills and do not auto-change game parameters from this sheet.

Current parameter snapshot:

| Parameter | Value |
|---|---:|
| previewDurationMs | 5000 |
| hideDurationMs | 12000 |
| seekDurationMs | 45000 |
| attackSectorDeg | 90 |
| attackRadiusPx | 120 |
| attackCountMultiplier | hiders x 2 |
| hiderHideSpeed | 220 |
| hiderSeekSpeed | 90 |
| seekerSpeed | 220 |

Required sample:

| Group | Required rounds | Initial target notes |
|---|---:|---|
| 2 players | 5 | 1 hider; full capture and survival are direct opposites. |
| 3 players | 5 | 2 hiders; expect partial captures most often. |
| 4 players | 10 | Phase 07 target: average 1-2 captures, 15%-35% full capture, 60%-80% at least one survivor, 30%-60% attacks depleted, 4-6 minute match. |

Round record table:

| match_id | round_index | player_count | map_id | seeker_id | hider_count | captures | attack_count_started | attack_count_remaining | end_reason | round_duration_sec | match_duration_sec | subjective_feedback |
|---|---:|---:|---|---|---:|---:|---:|---:|---|---:|---:|---|
| 2026-05-12-2p-01 | 1 | 2 | kitchen_01 | p1 | 1 | 0 | 2 | 0 | attacks_used | 67 | 134 | Seeker hesitated before final slap. |
| 2026-05-12-2p-01 | 2 | 2 | kitchen_01 | p2 | 1 | 1 | 2 | 1 | all_captured | 44 | 134 | Hider moved too visibly near seeker. |
| 2026-05-12-3p-01 | 1 | 3 | kitchen_01 | p1 | 2 | 1 | 4 | 0 | attacks_used | 67 | 201 | One good disguise survived. |
| 2026-05-12-4p-01 | 1 | 4 | kitchen_01 | p1 | 3 | 2 | 6 | 0 | attacks_used | 67 | 268 | Seeker used wide sweeps near clutter. |

Accepted JSON input for the summary tool:

```json
{
  "records": [
    {
      "matchId": "2026-05-12-4p-01",
      "roundIndex": 1,
      "playerCount": 4,
      "mapId": "kitchen_01",
      "seekerId": "p1",
      "hiderCount": 3,
      "captures": 2,
      "attackCountStarted": 6,
      "attackCountRemaining": 0,
      "endReason": "attacks_used",
      "roundDurationSec": 67,
      "matchDurationSec": 268,
      "subjectiveFeedback": "Seeker had pressure but still made two confident reads."
    }
  ]
}
```

Run:

```sh
node tools/balance/summarize-playtest.mjs docs/playtest/phase-07-balance-records.json
```

Summary metrics produced:

| Metric | Meaning |
|---|---|
| averageCaptures | Average hiders caught per round. |
| fullCaptureRate | Rounds where all hiders were captured. |
| atLeastOneSurvivedRate | Rounds where at least one hider survived. |
| attacksDepletedRate | Rounds ending with zero attacks or an attacks-used reason. |
| averageDurationSec | Average full-match duration; uses matchDurationSec, grouped matchId round sums, or roundDurationSec x playerCount as fallback. |

Target status values:

| Status | Meaning |
|---|---|
| within_target | Metric is inside the initial target interval. |
| below_target | Metric is below the interval; review notes before changing parameters. |
| above_target | Metric is above the interval; review notes before changing parameters. |
| missing | No records for that player count. |

Manual review notes:

- Confirm whether seekers win by memory and observation rather than random sweeping.
- Confirm whether hider wins feel tied to believable placement.
- Confirm whether limited attacks create hesitation.
- Parameter changes, if any, must be made manually in the game config after reviewing raw notes and summary output.
