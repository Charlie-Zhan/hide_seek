# Phase 07 Regression and Stability Matrix

## Scope

Phase 07 validates MVP readiness for a small external playtest. This matrix covers Lobby, Room, WeChat share launch, Preview, Hide, Seek, Result, MatchEnd, disconnect/reconnect, and restart. It does not add new gameplay, V2 tasks, random events, ranking, monetization, or extra maps.

## Test Build Record

```text
Date:
Build / commit:
Client platform: browser / WeChat DevTools / real device
Server endpoint:
Map:
Tester(s):
Device(s):
Network:
```

## Functional Regression Matrix

| ID | Area | Preconditions | Steps | Expected result | Evidence |
|---|---|---|---|---|---|
| P07-REG-001 | Lobby | Fresh launch, no active room | Enter a valid nickname and create a room | Lobby creates a room, transitions to Room, and stores a stable local identity | Room code, playerId in non-sensitive logs |
| P07-REG-002 | Lobby | Fresh launch | Attempt blank or overlong nickname | Client/server reject invalid name with visible error; no room is created | Error screenshot or log |
| P07-REG-003 | Room | Host is in a waiting room | Copy/share visible room code and verify player list | Room code is readable, host appears once, ready/start controls reflect room state | Room screenshot |
| P07-REG-004 | Room | Host room exists | Second player joins with room code using lowercase and uppercase variants | Join normalizes room code and adds the second player once | Server room state |
| P07-REG-005 | Room | Room has fewer than min players | Host starts match | Start is rejected with a clear not-enough-players path | Error state |
| P07-REG-006 | Room | Room has 2-4 players | Start match | Server marks room playing and clients receive match start/state | `match_starting` or `state` log |
| P07-REG-007 | Share launch | Host room exists in WeChat runtime | Share room card, open it as another player | Launch query contains `roomId`; guest auto-joins the target room with current, cached, or default identity | Share payload and guest room state |
| P07-REG-008 | Share launch | Invalid, expired, or malformed room link | Open the share entry | Client shows join failure and remains recoverable in Lobby/Room flow | Error screenshot/log |
| P07-REG-009 | Preview | Match just started | Send movement/action from seeker and hider | Player characters remain hidden, inputs are ignored, original props stay visible | State snapshot and screen |
| P07-REG-010 | Hide | Preview elapsed | Seeker attempts movement/attack | Seeker sees blind/static overlay and server ignores seeker input | Redacted seeker state |
| P07-REG-011 | Hide | Hide phase active | Hider moves, stops, and switches prop twice quickly | Hider can move at hide speed; idle becomes disguised; prop switch has no cooldown | State snapshot |
| P07-REG-012 | Seek | Seek phase active | Seeker moves and attacks toward breakable props | Seeker moves, attack consumes exactly one count, fan area can destroy multiple props | Events and attack count |
| P07-REG-013 | Seek | Seek phase active | Hider moves and switches prop | Hider remains in prop form, moves at slow speed, can switch prop without cooldown | State snapshot |
| P07-REG-014 | Seek | Hider is inside attack sector | Seeker attacks | Hider is captured by server authority and receives no survival point | `hider_captured` and score events |
| P07-REG-015 | Seek | Attack count near zero | Use final attack without all hiders captured | Round immediately enters Result with surviving hiders scored | `round_ended: attacks_used` |
| P07-REG-016 | Result | Round just ended | Compare all clients | Result shows same captured/survived players, score deltas, totals, and next seeker | Screenshots from clients |
| P07-REG-017 | MatchEnd | Each player has been seeker once | Finish final Result countdown | MatchEnd shows final ranking; no active controls can affect match state | Final state snapshot |
| P07-REG-018 | Restart | MatchEnd or finished room | Use the MatchEnd restart-room control without app reload | Client sends `restart_room`; restarted match starts at Preview with clean room state and no stale props/captures/attack count | Restart request, room update, and first state |

## Stability Matrix

| ID | Area | Fault | Steps | Expected result | Evidence |
|---|---|---|---|---|---|
| P07-STAB-001 | Waiting room | Guest disconnects | Disconnect a non-host before match start | Guest is removed; room remains usable | Room state |
| P07-STAB-002 | Waiting room | Host disconnects | Disconnect host before match start | Room remains if other players exist; ownership transfers | Room state |
| P07-STAB-003 | Game | Hider disconnects in Seek | Disconnect hider and wait through grace window | Hider is captured/no survival score after timeout; round ends if all hiders are captured | State/events |
| P07-STAB-004 | Game | Seeker disconnects in Seek | Disconnect seeker and wait through grace window | Round ends early and surviving hiders are scored | State/events |
| P07-STAB-005 | Network | Short disconnect/reconnect | Drop client socket and restore within reconnect window | Client reconnects, resends join/resume target, and receives authoritative state | Client reconnect state log |
| P07-STAB-006 | Network | Reconnect exhausted | Keep socket unavailable beyond retry policy | Client reports failure and offers recoverable room/lobby path | Client error state |
| P07-STAB-007 | Server | Server restarted during room flow | Restart server while clients are in Lobby/Room/Game | Clients show a clear lost-room/server error; no local state fabricates a hit/score | Client/server logs |
| P07-STAB-008 | Weak network | 200-500 ms latency or packet loss | Play one full 2-4 player match | Server state remains authoritative; no duplicate joins, negative attack count, or score divergence | Logs and score comparison |

## Balance Capture Matrix

Run at least:

| Player count | Required sessions | Target notes |
|---|---:|---|
| 2 players | 5 | Verify one hider still has meaningful hiding choices. |
| 3 players | 5 | Watch whether seeker catches 1 hider on average. |
| 4 players | 10 | Target 1-2 average captures, 15%-35% all-caught rate, 30%-60% attacks-used endings. |

Record per session:

```text
Session ID:
Players:
Map:
Total match duration:
Average round duration:
Seeker captures:
All hiders captured: yes/no
At least one hider survived: yes/no
Attacks exhausted: yes/no
Hider movement count:
Hider prop switches:
Seeker mistaken attacks:
Subjective feedback:
Follow-up:
```

## Automated Smoke Coverage

Run:

```bash
npm run test
npm run typecheck
```

Phase 07 smoke target:

- `server/tests/phase07-regression-smoke.test.ts` checks room creation/join/start, share-code normalization, authoritative phase flow, seeker/hider input gates, Result/MatchEnd, disconnect timeout handling, and the supported finished-room reset path for restart coverage.

## Release Gate Checklist

- [ ] No blocking crash in Lobby, Room, Game, Result, or MatchEnd.
- [ ] Share launch reliably carries and reads `roomId`.
- [ ] Disconnect/reconnect behavior is explicit and recoverable.
- [ ] Scores are server-authoritative and consistent across clients.
- [ ] First package size, FPS, memory, WebSocket latency, and message volume are recorded by the release worker.
- [ ] Asset license records are present before non-placeholder assets are promoted.
- [ ] Debug or cheat UI is not visible to normal players.
- [ ] No MVP-forbidden feature appears in UI copy, tests, or runtime behavior.
