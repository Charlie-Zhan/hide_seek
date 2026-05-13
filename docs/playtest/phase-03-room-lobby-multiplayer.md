# Phase 03 Room And Lobby Multiplayer Checklist

## Scope

Friend-room entry only: create room, join room, player list, ready state, start match, and Game scene handoff. Full authoritative gameplay sync is Phase 04.

## Manual Checks

- Start the server with `npm run dev --workspace @prop-hide-seek/server`.
- Client A creates a room and receives a room code.
- Client B joins with the room code.
- Both clients see the same player list and ready status.
- Starting with one player returns `not_enough_players`.
- With at least two players, `start_match` broadcasts `match_starting`.
- Disconnecting a waiting-room client removes that player and updates the remaining clients.

## Automated Checks

Run:

```bash
npm run test
npm run typecheck
npm run validate:phase03
```
