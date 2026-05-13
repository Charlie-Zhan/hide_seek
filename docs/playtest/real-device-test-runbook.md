# Real Device Test Runbook

## Scope

This runbook is for the next real-device and WeChat Mini Game landing test of
the MVP Prop Hide & Seek loop. It covers setup, room sharing, two-device network
checks, reconnect checks, restart checks, and V2 default-off verification.

Do not add new gameplay during this test pass. V2 objective and ambient event
experiments are only checked as flag behavior: default off for MVP rooms, and
explicitly on only for a named V2 test room.

## People

Required minimum:

| Role | Count | Responsibility |
|---|---:|---|
| Test lead | 1 | Owns build id, room codes, checklist, and final go/no-go notes. |
| Host tester | 1 | Creates rooms, shares room entry, records host-side issues. |
| Guest tester | 1-3 | Joins via share entry and records guest-side issues. |
| Server observer | 1 | Watches server logs, reconnect state, room cleanup, and errors. |

Minimum executable session: 2 players on 2 phones. Preferred release session:
4 players on 4 phones, with one laptop running server logs and WeChat DevTools.

## Devices And Network

Prepare before the session:

| Item | Requirement | Record in template |
|---|---|---|
| Phones | At least 2 physical phones with WeChat installed. Include one lower-end device if available. | Device model, OS, WeChat version. |
| Laptop | Runs Node server, Cocos Creator, WeChat DevTools, and logs. | OS and tool versions. |
| Same Wi-Fi | All phones and laptop on the same LAN for baseline testing. | SSID or label, local IP, room code. |
| Different networks | Host and guest on different networks, such as Wi-Fi plus cellular. | Network type per device. |
| Weak network | Simulated latency/loss or real poor network. | Method, latency, observed recovery. |

Use a `wss` endpoint for remote or cross-network WeChat tests. Local `ws`
testing is acceptable only for same-machine or LAN development smoke checks and
must be recorded as not release-ready remote validation.

## Start Server

1. From the repository root, install dependencies if needed:

   ```bash
   npm install
   ```

2. Start the server with the configured test environment. For same Wi-Fi phone
   testing, bind the server to the laptop LAN interface:

   ```powershell
   $env:HOST='0.0.0.0'
   $env:PORT='8787'
   npm.cmd run dev --workspace @prop-hide-seek/server
   ```

   Docker alternative:

   ```powershell
   npm.cmd run docker:server
   ```

   This publishes the server on `0.0.0.0:8787` from the container and can be
   used for same-Wi-Fi phone testing with `ws://<laptop-lan-ip>:8787`.

   Host-machine LAN smoke alternative when Docker Desktop is unavailable:

   ```powershell
   npm.cmd run lan:endpoints
   npm.cmd run smoke:lan-ws
   ```

   This binds the room server to `0.0.0.0:8787`, connects two local smoke
   clients through `127.0.0.1:8787`, and confirms the same create, join, ready,
   start, and Preview path before phones use `ws://<laptop-lan-ip>:8787`.

   For an actual phone session without Docker, start the long-running LAN
   server:

   ```powershell
   npm.cmd run server:lan
   ```

   The command prints detected same-Wi-Fi phone endpoints. Use the endpoint that
   matches the laptop's active Wi-Fi or Ethernet IPv4 address.

3. Record:

   ```text
   Server command:
   Server endpoint:
   Docker image or host Node, if applicable:
   Public or LAN URL:
   Build / commit:
   Start time:
   ```

4. Confirm logs show room lifecycle, connection state, phase transitions,
   attack budget, scoring, and reconnect handling. Logs must not include raw
   profile payloads, private tokens, or credential-bearing URLs.

## Configure WebSocket URL

1. Locate the active client WebSocket configuration for the current branch:

   ```text
   client/assets/scripts/network/NetworkConfig.ts
   ```

2. Set the runtime endpoint to the server URL used by the devices:

   ```text
   Same Wi-Fi: ws://<laptop-lan-ip>:<port> or wss://<test-host>
   Different networks: wss://<public-test-host>
   ```

3. Preferred runtime override for Cocos or WeChat DevTools smoke runs:

   ```js
   globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = 'ws://<laptop-lan-ip>:8787';
   ```

   The branch also supports a grouped config object:

   ```js
   globalThis.__PROP_HIDE_SEEK_CONFIG__ = {
     roomServerUrl: 'wss://<public-test-host>'
   };
   ```

4. Preferred persistent WeChat test override:

   ```text
   storage key: prop_hide_seek_room_server_url
   value: wss://<public-test-host>
   ```

   Same-Wi-Fi development can use `ws://<laptop-lan-ip>:8787`. Cross-network
   or hosted WeChat testing should use `wss`.

5. Build-time and runtime records must include:

   ```text
   WebSocket URL label:
   Actual scheme: ws or wss
   Config file or runtime override:
   Storage key used, if any:
   Room resume mode observed: resume_room or join_room fallback
   ```

6. Do not hard-code a new endpoint in multiple scripts for the test. If a
   temporary override is used, record it in the session notes and clear it after
   the test through the normal owner of that configuration.

## Cocos Creator Open And Build

1. Open Cocos Creator 3.x.
2. Open the project at:

   ```text
   C:\Users\99722\mycodex\projects\hide_seek\client
   ```

3. Confirm required scenes are present and the build target is WeChat Mini Game.
4. Build to a clean export directory and record:

   ```text
   Cocos Creator version:
   Build target:
   Export path:
   Build id:
   Build time:
   First package size:
   ```

5. If the build fails, stop the real-device run and record the blocking error.

## WeChat DevTools Import

1. Open WeChat DevTools.
2. Import the Cocos exported WeChat Mini Game project.
3. Use the test AppID or tourist/dev mode approved for the branch.
4. Confirm the simulator launches and can connect to the server endpoint.
5. Record:

   ```text
   WeChat DevTools version:
   Project import path:
   AppID mode:
   Simulator FPS:
   Simulator memory:
   Console errors:
   ```

6. Do not mark real-device testing complete from simulator results alone.

## Share Into Room

1. Host launches the Mini Game on a phone.
2. Host creates a room and records the room code.
3. Host shares the room card or test entry carrying:

   ```text
   roomId=<room-code>
   ```

4. Guest opens from the shared entry.
5. Verify the guest auto-joins the target room and appears exactly once.
6. If share entry fails, try manual room code entry only as a diagnostic and
   record share as failed.

Expected result:

- Share payload contains `roomId`.
- Guest lands in the host room.
- Player list and ready state match on all devices.
- Server logs show one join per player identity.

## Same Wi-Fi Two-Device Baseline

Run first with 2 phones on the same Wi-Fi:

1. Host creates and shares a room.
2. Guest joins from the shared entry.
3. Start a 2-player match.
4. Complete Preview, Hide, Seek, Result, and MatchEnd.
5. Start another room or match flow without restarting the app.

Record per round:

- Preview hides players and locks input.
- Hide blinds seeker and allows hider movement and prop switching.
- Seek allows seeker movement and fan attack.
- Attack count decrements exactly once per attack.
- Hider capture, survival, and score match on both devices.
- MatchEnd ranking matches on both devices.
- Restart begins cleanly at Preview with no stale captures, props, or attack
  count.

## Different Network Check

Run after same Wi-Fi passes:

1. Put at least one guest on cellular or another Wi-Fi.
2. Use a reachable `wss` endpoint.
3. Repeat share join and one full 2-player match.
4. Record average latency, visible input delay, disconnects, and score
   consistency.

Block release readiness if the second device cannot join by share entry or if
score/phase state diverges reproducibly.

## Weak Network Check

Use controlled throttling if available, otherwise use a known poor network:

```text
Target latency: 200-500 ms
Packet loss: record if simulated
Duration: one full match
```

Expected result:

- Clients remain recoverable.
- Server remains authoritative for phase, attack hits, captures, round end, and
  score.
- No duplicate joins, negative attack counts, fabricated hits, or local-only
  scores appear.

## Disconnect And Reconnect

Run both paths:

| Case | Steps | Expected result |
|---|---|---|
| Hider reconnect | During Seek, background or disconnect the hider device, then restore within retry window. | Client reconnects, sends `resume_room` when session is known or falls back to `join_room`, and receives authoritative state. |
| Seeker reconnect | During Seek, background or disconnect the seeker device, then restore within retry window. | Reconnect handling is visible and recoverable; phase/score remain server-authoritative. |
| Reconnect exhausted | Keep one device offline beyond retry policy. | Client shows clear failure path; room does not fabricate captures or scores locally. |

Record disconnect time, reconnect time, final state, and any server log event.

## Start Another Match

After MatchEnd:

1. Return to lobby or create a new room using the current supported flow.
2. Start another match without killing the app.
3. Verify the next match starts at Preview.
4. Confirm no stale room code, role, captured state, broken props, score delta,
   or attack count carries into the new match.

## V2 Default-Off And Explicit-On Check

MVP rooms:

1. Create a normal room with no V2 flags.
2. Record:

   ```text
   phase08V2Enabled=false
   v2ObjectivesEnabled=false
   v2EventsEnabled=false
   ```

3. Verify no objective UI, no objective points, no ambient event behavior, no
   extra scoring, and no change to Preview/Hide/Seek/Result.

V2 test room:

1. Only if a branch owner provides an explicit V2 flag setup, create a named V2
   test room.
2. Record:

   ```text
   phase08V2Enabled=true
   v2ObjectivesEnabled=<true/false>
   v2EventsEnabled=<true/false>
   ```

3. Run the Phase 08 V2 playtest plan separately.
4. After the V2 room, create another normal MVP room and verify all V2 flags are
   off again.

Do not treat V2 experiment success as MVP release readiness. MVP readiness
requires default-off behavior to be unchanged.

## Stop Conditions

Stop the session and file a blocking issue if any of these occur:

- A reproducible crash on device.
- Share join cannot complete on a second physical device.
- Reconnect has no visible or recoverable handling.
- Server and client disagree on captures, score, attack count, or phase.
- Restart creates stale match state.
- Actual first package size cannot be recorded.
- V2 behavior appears in a default MVP room.
