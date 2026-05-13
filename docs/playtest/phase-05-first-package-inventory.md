# Phase 05 First Package Inventory

## Current Boundary

The first package should contain only the startup flow, lobby/room screens, the first MVP map config, core UI, touch input, network client, and base character/prop metadata needed for `kitchen_01`.

Current repository note: the checked-in Cocos `.scene` files are placeholder
manifests used to preserve scene names and intended hierarchy. Do not treat this
inventory as proof that a real Cocos Creator visual scene export has been
completed; record that evidence after opening/exporting the project manually.

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

Actual WeChat package size must be recorded after exporting from Cocos Creator 3.x to the WeChat Minigame target. This repository currently records the intended first-package boundary and prevents unrelated later-phase assets from entering the MVP package.
