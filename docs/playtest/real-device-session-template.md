# Real Device Session Template

Copy this template for each real-device session. Leave unknown fields blank; do
not mark unrun checks as passed.

## Session Header

```text
Session ID:
Date:
Test lead:
Build / commit:
Cocos Creator version:
WeChat DevTools version:
Server command:
Server endpoint:
WebSocket scheme: ws / wss
Config path or override:
Map ID:
Room code:
Player count:
MVP room V2 flags verified off: yes / no
V2 explicit test room used: yes / no
```

## Devices

| Slot | Player ID label | Nickname | Role in first round | Device model | OS version | WeChat version | Battery / thermal notes |
|---|---|---|---|---|---|---|---|
| Host |  |  | Seeker / Hider |  |  |  |  |
| Player 2 |  |  | Seeker / Hider |  |  |  |  |
| Player 3 |  |  | Seeker / Hider |  |  |  |  |
| Player 4 |  |  | Seeker / Hider |  |  |  |  |

## Network

| Case | Devices | Network type | Endpoint used | Average latency ms | Packet loss / weak network method | Result |
|---|---|---|---|---:|---|---|
| Same Wi-Fi |  |  |  |  |  | pass / fail / not run |
| Different networks |  |  |  |  |  | pass / fail / not run |
| Weak network |  |  |  |  |  | pass / fail / not run |

## Build And Package

```text
Export path:
First package size:
First package contents changed: yes / no
Asset license check completed: yes / no / placeholder only
Simulator FPS:
Simulator memory MB:
Device FPS average:
Device FPS minimum:
Device memory MB:
Messages per match:
Crash or stall: yes / no
```

## Share Into Room

```text
Share payload contains roomId: yes / no
Guest opened from share entry: yes / no
Guest auto-joined correct room: yes / no
Manual room-code fallback used: yes / no
Duplicate join observed: yes / no
Notes:
```

## Reconnect Checks

| Case | Phase | Disconnect method | Offline duration sec | Recovery message | resume_room observed | join_room fallback observed | Final state correct | Notes |
|---|---|---|---:|---|---|---|---|---|
| Hider reconnect | Seek |  |  |  | yes / no | yes / no | yes / no |  |
| Seeker reconnect | Seek |  |  |  | yes / no | yes / no | yes / no |  |
| Reconnect exhausted | Any |  |  |  | yes / no | yes / no | yes / no |  |

## Round Records

| Match ID | Round | Seeker | Hider count | Captures | Survivors | Attack count started | Attacks used | Attacks remaining | End reason | Round duration sec | Score consistent on all devices | Notes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
|  | 1 |  |  |  |  |  |  |  | all_captured / attacks_used / timer / disconnect |  | yes / no |  |
|  | 2 |  |  |  |  |  |  |  | all_captured / attacks_used / timer / disconnect |  | yes / no |  |
|  | 3 |  |  |  |  |  |  |  | all_captured / attacks_used / timer / disconnect |  | yes / no |  |
|  | 4 |  |  |  |  |  |  |  | all_captured / attacks_used / timer / disconnect |  | yes / no |  |

## Phase Checklist

| Check | Result | Evidence |
|---|---|---|
| Preview shows original map only and locks all input. | pass / fail / not run |  |
| Hide blinds seeker and ignores seeker movement/attack. | pass / fail / not run |  |
| Hider moves normally in Hide and becomes disguised when idle. | pass / fail / not run |  |
| Hider prop switching has no cooldown. | pass / fail / not run |  |
| Seek allows seeker movement and fan attack. | pass / fail / not run |  |
| Fan attack can break multiple props in range. | pass / fail / not run |  |
| Fan attack captures disguised hider in range by server authority. | pass / fail / not run |  |
| Attack depletion immediately ends the round. | pass / fail / not run |  |
| Result score matches capture/survival rules. | pass / fail / not run |  |
| MatchEnd ranking matches on all devices. | pass / fail / not run |  |
| Starting another match has clean state. | pass / fail / not run |  |

## V2 Flag Check

MVP default room:

```text
phase08V2Enabled=false observed: yes / no
v2ObjectivesEnabled=false observed: yes / no
v2EventsEnabled=false observed: yes / no
No V2 UI or behavior observed: yes / no
```

Explicit V2 room, if run:

```text
phase08V2Enabled=true observed:
v2ObjectivesEnabled:
v2EventsEnabled:
Phase 08 playtest plan record link:
MVP default-off rechecked after V2 room: yes / no
```

## Issue Log

| ID | Severity | Device | Network | Phase | Repro steps | Expected | Actual | Evidence | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| RDT-001 | blocker / major / minor |  |  |  |  |  |  |  |  | open |

## Final Decision

```text
Go / no-go:
Blocking issues:
Known non-blocking issues:
Follow-up owner:
Notes:
```

