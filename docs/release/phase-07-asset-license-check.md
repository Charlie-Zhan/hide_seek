# Phase 07 Asset License Check

## Asset License Check

Before any imported real art is included in a small release build, verify:

- Kenney package name is recorded.
- Source URL is recorded.
- Retrieval date is recorded.
- License file or copied license text is present.
- Normalized sprite names covered by the source are listed.
- Raw source archives are excluded from the client first package.
- Runtime assets are organized into purpose-specific atlases.

## Required Repository Locations

- `client/assets/art/kenney/README.md`
- `client/assets/art/kenney/licenses/README.md`
- `client/assets/art/generated/cats/README.md`
- `client/assets/art/generated/cat_animations/README.md`
- `client/assets/art/generated/cat_directions/README.md`
- `client/assets/art/generated/cat_diagonals/README.md`
- `client/assets/art/generated/cat_crouches/README.md`
- `client/assets/art/generated/cat_directional_attacks/README.md`
- `client/assets/art/generated/cat_back_attacks/README.md`
- `client/assets/art/generated/kitchen_props_v2/README.md`
- `tools/asset-pipeline/README.md`
- `tools/asset-pipeline/kenney_sources_phase_02.json`
- `client/assets/art/kenney/atlas_gameplay_props.json`
- `client/assets/resources/art/characters/cats/cat_players_manifest.json`

## Current Phase 07 Status

Phase 07 currently keeps a minimal Kenney Topdown Shooter runtime set as a
licensed fallback/reference set, and promotes generated full-body cat sprites,
generated side/front/back/diagonal walk, crouch, and attack cat animation
frames, and generated kitchen V2 prop sprites for the current playtest visuals.
Full raw source packages must remain outside the client first package.

## First Package Review

For each imported asset package, mark one:

| Package | Source URL | License file | Used in first package | Atlas | Approved |
| --- | --- | --- | --- | --- | --- |
| Topdown (Shooter) Pack | https://www.kenney.nl/assets/top-down-shooter | `client/assets/art/kenney/licenses/kenney_top-down-shooter_LICENSE.txt` | yes, selected normalized PNGs only | `atlas_gameplay_props` metadata; runtime PNG set | yes |
| Generated cat player sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cats/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_players_manifest` metadata; runtime PNG set | yes |
| Generated cat animation sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cat_animations/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_animation_manifest` metadata; runtime PNG set | yes |
| Generated cat direction sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cat_directions/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_direction_manifest` metadata; runtime PNG set | yes |
| Generated cat diagonal sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cat_diagonals/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_diagonal_manifest` metadata; runtime PNG set | yes |
| Generated cat crouch sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cat_crouches/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_crouch_manifest` metadata; runtime PNG set | yes |
| Generated cat directional attack sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cat_directional_attacks/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_directional_attack_manifest` metadata; runtime PNG set | yes |
| Generated cat back attack sprites | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/cat_back_attacks/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `cat_directional_attack_manifest` metadata; runtime PNG set | yes |
| Generated kitchen V2 props | local generated asset | `client/assets/art/generated/README.md`; `client/assets/art/generated/kitchen_props_v2/PROMPT.md` | yes, selected chroma-key cutout PNGs only | `kitchen_v2_manifest` metadata; runtime PNG set | yes |

Reject the build if a real asset is present without a matching source and
license record.
