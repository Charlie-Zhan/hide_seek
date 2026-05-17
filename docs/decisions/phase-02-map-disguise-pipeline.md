# Phase 02 Map And Disguise Pipeline

## Scope

Phase 02 defines one MVP map, `kitchen_01`, and one map-level disguise pool. It does not add a second map, random events, hider tasks, real networking, or commercial skins.

## Layout Decision

The kitchen is 1440x810 and split into five readable zones:

- top-left fridge corner;
- top-right stove counter;
- center dining table;
- bottom-left crate stack;
- bottom-right trash and plant corner.

These zones create five memory anchors for Preview without filling the whole screen with clutter. The center table and island break sightlines, while the lower corners provide believable prop clusters where a disguised hider can stand without looking special.

## Counts

- Landmarks: 5
- Spawn/test positions: 4
- Seeker spawn points: 1
- Breakable small props: 35
- Obstacles: 6
- Occluders: 6
- Map-level disguise ids: 6

## Disguise Pool

`kitchen_01` uses exactly these MVP disguise ids:

- `wooden_crate`
- `trash_bin`
- `plant_pot`
- `chair`
- `water_bucket`
- `food_basket`

The same ids are used by ordinary map props so hiders do not appear visually special after switching disguises.

## Asset Handling

Phase 02 worker A records placeholder atlas metadata only. No Kenney art bytes are imported. Real art import must first record the Kenney package name, source URL, and license text under `client/assets/art/kenney/licenses/`, then generate purpose-specific atlas output instead of placing raw full packs in the client package.
