# Phase 07 Release Readiness

## Scope

This record covers small release preparation only: test accounts, test flow,
FAQ, error log toggle, performance fields, first package size, and asset license
check. Regression and balance records are owned by parallel Phase 07 workers and
are expected to land separately.

## Test Accounts

Use `docs/release/phase-07-small-release-runbook.md` to record host and player
identity sources. Temporary uuid identities are acceptable for development
testing when WeChat identity is unavailable.

## Test Flow

Follow the runbook flow:

- Build to WeChat Minigame.
- Open in WeChat DevTools.
- Create room.
- Share or enter `roomId`.
- Complete one full match.
- Run hider reconnect and seeker reconnect checks.
- Record performance, package size, visible errors, and release blockers.

## FAQ

Tester-facing answers live in `docs/release/phase-07-faq.md`. Keep FAQ answers
focused on joining, reconnecting, expected Hide behavior, and what data testers
should report.

## Error Log Toggle

The release default is `PHASE07_DEBUG_LOGS=false`. Enable
`PHASE07_DEBUG_LOGS=true` only during targeted repro work. Logs may include room
state, phase transitions, connection state, attack budget, and aggregate
performance samples. Logs must not include private profile payloads or secrets.

## Performance Fields

Record fields in `docs/release/phase-07-performance-and-package-log.md`:

- WeChat DevTools FPS.
- Device FPS.
- Memory MB.
- WebSocket Average Latency MS.
- Messages Per Match.
- Crash Or Stall.

## First Package Size

Actual WeChat package size must be recorded after Cocos Creator export to the
WeChat Minigame target. Record the export path, build id, package size, whether
first package contents changed, and notes.

## Asset License Check

Use `docs/release/phase-07-asset-license-check.md`. Placeholder metadata is
acceptable only if no real art bytes are included. Real Kenney art requires
source URL, retrieval date, package name, and license record before release.

## Blocked By Other Workers

The Phase 07 validator also expects the parallel regression and balance
deliverables:

- `docs/playtest/phase-07-regression-matrix.md`
- `docs/playtest/phase-07-balance-template.md`

If these files are missing, `npm run validate:phase07` should fail with an
expected missing item list rather than hiding the dependency.

## MVP Forbidden Feature Scan

The validator scans active client, server, shared source, and runtime config
paths for later-version gameplay or product scope. Phase 07 must not introduce
new abilities, progression systems, monetization, peer networking, or new map
event systems.

## Automated Checks

Run:

```bash
npm run validate:phase07
```
