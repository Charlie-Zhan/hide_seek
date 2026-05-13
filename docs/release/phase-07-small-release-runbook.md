# Phase 07 Small Release Runbook

## Release Scope

This is an invite-only MVP playtest release for the existing Prop Hide & Seek loop:
Preview, Hide, Seek, Result, and MatchEnd. The release exists to verify stability,
share-room flow, mobile controls, first package size, performance, and asset
license readiness before wider testing.

Do not add new gameplay systems during this release pass. Balance changes should
stay limited to existing timing, movement, attack radius, attack count, and map
prop density values.

## Test Accounts

MVP can use temporary identities. Record the identifier source used by each test:

| Slot | Device | Network | Identity source | Nickname | Notes |
| --- | --- | --- | --- | --- | --- |
| Host |  |  | openid or dev uuid |  |  |
| Player 2 |  |  | openid or dev uuid |  |  |
| Player 3 |  |  | openid or dev uuid |  |  |
| Player 4 |  |  | openid or dev uuid |  |  |

Account handling rules:

- Do not log raw sensitive user data.
- Use `playerId` for server identity and room resume checks.
- Use nickname only for room display and playtest notes.
- If WeChat profile access is unavailable, use a local temporary uuid.

## Test Flow

1. Build the Cocos Creator project for WeChat Minigame.
2. Open the exported project in WeChat DevTools.
3. Confirm the configured WebSocket endpoint uses `wss` for remote testing.
4. Host creates a room and records the room code.
5. Host shares the room card or a test link carrying `roomId`.
6. Other players join from the shared room entry.
7. Verify ready state and start the match.
8. Complete Preview, Hide, Seek, Result, and MatchEnd.
9. Run one reconnect check with a hider and one reconnect check with the seeker.
10. From MatchEnd, use the room restart flow and verify the room returns to
    waiting with ready states cleared before starting another match.
11. Record package size, performance, errors, and any blocking issue.

Reconnect checks should confirm whether the client sends `resume_room` for a
known room session or falls back to `join_room` with clear user-facing handling.
After MatchEnd, restart checks should use the supported `restart_room` flow;
creating a separate new room is only a diagnostic fallback.

## Error Log Toggle

Use one release-visible switch for debug logging. The recommended default for
small release testing is:

```text
PHASE07_DEBUG_LOGS=false
```

Enable it only for a targeted repro:

```text
PHASE07_DEBUG_LOGS=true
```

When enabled, logs may include room lifecycle, phase transitions, connection
state, retry state, attack budget, and aggregate performance samples. Logs must
not include raw profile payloads, private tokens, or full WebSocket URLs with
credentials.

## Release Gate

The release is not ready if any of these are true:

- A blocking crash is reproducible.
- Share-room join cannot complete on a second device.
- Reconnect has no clear user-facing handling.
- Score state can desync in a reproducible path.
- Actual WeChat package size is not recorded.
- Kenney source and license records are incomplete for imported real art.
- MVP-only controls are diluted by later-version gameplay.

## Commands

Run before tagging an internal test build:

```bash
npm run test
npm run typecheck
npm run validate:phase07
```
