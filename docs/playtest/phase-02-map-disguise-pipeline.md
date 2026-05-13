# Phase 02 Map And Disguise Pipeline Checklist

## Scope

Validate `kitchen_01`, the map-level disguise pool, breakable prop behavior, occluders, obstacles, and placeholder asset records.

## Manual Checks

- Kitchen map loads as one full 1280x720 play area.
- Landmarks are readable: fridge area, stove area, center table, crate pile, trash/plant corner.
- Props are distributed in small groups and isolated placements, not an unreadable pile.
- Hiders can cycle only through the map pool: wooden crate, trash bin, plant pot, chair, water bucket, food basket.
- Breakable props destroyed by attack do not get hit again.
- Occluders are front-layer-only and do not add interaction buttons.

## Automated Checks

Run:

```bash
npm run test
npm run typecheck
npm run validate:phase02
```
