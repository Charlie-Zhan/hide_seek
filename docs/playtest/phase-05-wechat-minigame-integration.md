# Phase 05 WeChat Minigame Integration Checklist

## Scope

WeChat minigame adaptation for the already server-authoritative multiplayer loop: lightweight player identity, share-to-room launch parameters, touch-safe mobile controls, reconnect UX hooks, and first-package resource records.

## Manual Checks

- WeChat developer tools can open the Cocos build target and start in Lobby.
- A normal launch enters Lobby without requiring a WeChat nickname permission prompt.
- A launch query containing `roomId` is parsed and offered to the room join flow.
- Room share payload includes `roomId` in the query string.
- Local player profile is cached and reused without logging sensitive user data.
- Left joystick touch and right action touch can be held at the same time.
- Landscape safe area insets keep controls away from system gesture areas.
- WebSocket disconnect changes connection state and schedules a short reconnect attempt.
- Reconnect recovery can re-send the room join intent when a cached room exists.
- First package inventory lists only startup, lobby, room, first map, base UI, core character/prop resources.

## Automated Checks

Run:

```bash
npm run test
npm run typecheck
npm run validate:phase05
```
