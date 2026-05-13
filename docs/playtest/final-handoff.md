# Final Handoff

## Scope

This handoff is the final PR-prep gate for the MVP playtest package. It checks
that verification entry points and playtest paperwork are present, but it does
not claim real-device testing has passed. Real-device results remain manual
evidence until filled by testers.

No MVP-forbidden gameplay is added by this handoff.

## Completed Phase Records

Phase validators expected before PR:

- `npm run validate:phase00`
- `npm run validate:phase01`
- `npm run validate:phase02`
- `npm run validate:phase03`
- `npm run validate:phase04`
- `npm run validate:phase05`
- `npm run validate:phase06`
- `npm run validate:phase07`
- `npm run validate:phase08`

Existing phase documentation records are under `docs/decisions/`,
`docs/playtest/`, `docs/release/`, and `docs/design/`.

## Automated Validation

Run these before opening the final PR:

```bash
npm run validate:ready-pr
npm run typecheck
```

The ready-pr gate checks:

- phase00-phase08 validator scripts and package entries;
- real-device runbook, session template, and PR checklist paths;
- Dockerfile, docker-compose, and Docker smoke/test script entries;
- smoke script package entry;
- WeChat minigame settings;
- server host/port configuration entry points;
- client room server URL configuration entry point;
- this final handoff.

## Smoke Command

Run the available smoke entry:

```bash
npm run lan:endpoints
npm run smoke:local-ws
npm run smoke:lan-ws
```

Current smoke entries exercise the local WebSocket path and a LAN-style
`0.0.0.0:8787` bind path. They are not replacements for WeChat DevTools or
real-device testing.

For a same-Wi-Fi phone session without Docker, run:

```bash
npm run server:lan
```

This starts the room server on `0.0.0.0:8787` and prints LAN WebSocket
endpoints for the client runtime override.

Optional container smoke:

```bash
npm run docker:smoke
```

Docker smoke runs the same local WebSocket path inside a clean Node container.
Use `npm run docker:server` when a phone on the same Wi-Fi should connect to the
containerized server through `ws://<laptop-lan-ip>:8787`.

## Real Device Items Still To Fill

Expected paths before PR:

- `docs/playtest/docker-test-runbook.md`
- `docs/playtest/real-device-test-runbook.md`
- `docs/playtest/real-device-session-template.md`
- `docs/release/pr-ready-checklist.md`

Minimum real-device evidence still required:

- WeChat DevTools launch and generated package size;
- two phones on the same Wi-Fi;
- two phones on different networks;
- weak-network or high-latency session;
- share-room join with `roomId`;
- hider reconnect and seeker reconnect;
- one full match through Preview, Hide, Seek, Result, and MatchEnd;
- server endpoint used for testing.

## Configuration Notes

Server runtime configuration is in `server/src/config/ServerConfig.ts` through
`HOST` and `PORT`.

Client room server configuration is centralized in
`client/assets/scripts/network/NetworkConfig.ts` as `defaultRoomServerUrl`.
The current default is local development (`ws://localhost:8787`), but runtime
testing can override it without editing multiple scripts.

Supported overrides, in priority order:

- explicit URL passed by the caller;
- `globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__`;
- `globalThis.__PROP_HIDE_SEEK_CONFIG__.roomServerUrl`;
- WeChat storage key `prop_hide_seek_room_server_url`;
- fallback `defaultRoomServerUrl`.

Before real-device testing, use a tested reachable endpoint and prefer `wss`
for remote WeChat Minigame testing. Same-Wi-Fi development can use
`ws://<laptop-lan-ip>:8787` while the server is bound with `HOST=0.0.0.0`.

## Do Not Commit Build Artifacts

Do not commit generated Cocos build output, WeChat DevTools export folders,
temporary package files, screenshots, logs, or raw downloaded asset archives
unless a release checklist explicitly requests a small text record.
