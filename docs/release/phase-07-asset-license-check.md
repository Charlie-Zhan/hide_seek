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
- `tools/asset-pipeline/README.md`
- `tools/asset-pipeline/kenney_sources_phase_02.json`
- `client/assets/art/kenney/atlas_gameplay_props.json`

## Current Phase 07 Status

Phase 07 may ship placeholders if no real Kenney art has been imported. If real
sprites are promoted into the build, add one license record per source package
before the build is handed to external testers.

## First Package Review

For each imported asset package, mark one:

| Package | Source URL | License file | Used in first package | Atlas | Approved |
| --- | --- | --- | --- | --- | --- |
|  |  |  | yes/no |  | yes/no |

Reject the build if a real asset is present without a matching source and
license record.
