# Phase 04 Server Authority Sync Checklist

## Scope

Server-authoritative in-game state: phases, movement, hider prop switching, seeker attacks, prop destruction, hider capture, round ending, scoring, and state broadcast.

## Manual Checks

- Two clients can start a room and receive `state` broadcasts after `match_starting`.
- Preview ignores all movement/action input.
- Hide ignores seeker input and accepts hider movement/switch prop.
- Seek accepts seeker movement/attack and hider slow movement/switch prop.
- Attack results come only from the server state/events.
- Every game event in `state.events` includes `id` and `serverTimeMs` so client runtime validation and event de-duplication work.
- Preview recipient state does not expose live player positions or current prop IDs.
- Hide recipient state does not expose map props or hider positions/prop IDs to the seeker.
- Destroyed props are not hit twice.
- Scores are identical across clients after round end.
- Hider disconnect timeout is treated as captured with no survival score after the 10 second grace window.
- Seeker disconnect timeout ends the current round early after the 10 second grace window.
- Match ends after each player has been seeker once.

## Automated Checks

Run:

```bash
npm run test
npm run typecheck
npm run validate:phase04
```
