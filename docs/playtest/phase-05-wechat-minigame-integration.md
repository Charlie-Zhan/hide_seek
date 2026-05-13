# Phase 05 WeChat Minigame Integration Checklist

## Scope

WeChat minigame adaptation for the already server-authoritative multiplayer loop: lightweight player identity, share-to-room launch parameters, touch-safe mobile controls, reconnect UX hooks, and first-package resource records.

## Manual Checks

- WeChat developer tools can open the Cocos build target and start in Lobby only
  after a manual Cocos Creator export has been produced. The checked-in
  `client/assets/scenes/*.scene` files are placeholder scene manifests; this
  record does not claim a fully wired visual Cocos scene is already playable.
- A normal launch enters Lobby without requiring a WeChat nickname permission prompt.
- A launch query containing `roomId` is parsed and immediately auto-joins the
  room with the current player name, cached profile nickname, or default
  fallback identity.
- Room share payload includes `roomId` in the query string.
- Room UI calls the WeChat share helper, and Lobby UI applies a launch `roomId`
  to the auto-join flow; physical share-card verification remains a manual
  check.
- Local player profile is cached and reused without logging sensitive user data.
- Left joystick touch and right action touch can be held at the same time.
- Landscape safe area insets keep controls away from system gesture areas.
- WebSocket disconnect changes connection state and schedules a short reconnect attempt.
- Reconnect recovery sends `resume_room` when the server-issued player id is
  known, with `join_room` remaining only a pre-join fallback.
- First package inventory lists only startup, lobby, room, first map, base UI, core character/prop resources.

## Automated Checks

Run:

```bash
npm run test
npm run typecheck
npm run validate:phase05
```
