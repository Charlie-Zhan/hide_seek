# Phase 05 First Package Inventory

## Current Boundary

The first package should contain only the startup flow, lobby/room screens, the first MVP map config, core UI, touch input, network client, and base character/prop metadata needed for `kitchen_01`.

Current export note: `client/HideSeek/wechatgame` contains a Cocos Creator
3.8.8 WeChat Mini Game export with `game.js`, `game.json`, `project.config.json`,
and the generated `assets/main` bundle. The export launches
`db://assets/scenes/Lobby.scene`.

## Included

- Scenes: `Boot.scene`, `Lobby.scene`, `Room.scene`, `Game.scene`, `Result.scene`.
- Scripts: core app/session helpers, room networking, WeChat platform adapter, touch input adapter, local/server gameplay bridges.
- Configs: `map_kitchen_01.json`, `disguise_props.json`, server URL defaults.
- Asset metadata: Kenney-derived prop atlas metadata already recorded under `client/assets/art/kenney`.

## Excluded

- Future maps.
- Cosmetic skins.
- Long audio.
- Raw Kenney source archives.
- Ranking, monetization, season, or release review material.

## Size Record

Actual WeChat package size recorded from `client/HideSeek/wechatgame`:

```text
Date: 2026-05-13 local
Target: Cocos Creator 3.8.8 / WeChat Mini Game
Export path: client/HideSeek/wechatgame
Total files: 42
Actual WeChat package size: 4,736,797 bytes / 4.52 MiB
Orientation: landscapeRight
Launch scene: db://assets/scenes/Lobby.scene
```

The current package stays inside the MVP first-package boundary: startup,
Lobby/Room/Game runtime bridge, first map config, base UI, touch input, network
client, and core character/prop metadata.
