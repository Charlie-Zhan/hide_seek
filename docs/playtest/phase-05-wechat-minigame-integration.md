# Phase 05 WeChat Minigame Integration Checklist

## Scope

WeChat minigame adaptation for the already server-authoritative multiplayer loop: lightweight player identity, share-to-room launch parameters, touch-safe mobile controls, reconnect UX hooks, and first-package resource records.

## Manual Checks

- WeChat developer tools should open `client/HideSeek/wechatgame` as a Mini
  Game project, not the Cocos project root. The prepared export has
  `compileType=game`, `setting.urlCheck=false`, `game.js`, `game.json`, and
  `assets/main/config.json`.
- The generated settings launch `db://assets/scenes/Lobby.scene`.
- A normal launch enters Lobby without requiring a WeChat nickname permission prompt.
- A launch query containing `roomId` is parsed and immediately auto-joins the
  room with the current player name, cached profile nickname, or default
  fallback identity.
- Room share payload includes `roomId` in the query string.
- During LAN playtests, Room share payload also carries `serverUrl` so another
  DevTools or phone instance can connect to the same room server.
- Room UI calls the WeChat share helper, and Lobby UI applies a launch `roomId`
  to the auto-join flow; physical share-card verification remains a manual
  check.
- Re-entering from a share card while the app is already open is handled through
  `wx.onShow` launch options.
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
npm run wechat:prepare-devtools
npm run smoke:existing-ws
```
