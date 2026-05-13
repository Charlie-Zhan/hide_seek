# Phase 07 Small Release FAQ

## Who is this build for?

Small invited test groups only. The build is for validating room flow, mobile
controls, stability, package size, performance, and release notes.

## How do testers join a room?

The host creates a room, then shares a room entry that carries `roomId`. A tester
opens the shared entry and should land in the same room automatically. If the
entry is unavailable, testers can enter the room code manually.

## What should testers do if joining fails?

Record the room code, device, network, build id, and visible error text. Then
retry once from the lobby. If it still fails, create a new room and attach the
old room code to the issue notes.

## What should testers do if reconnect fails?

Record whether the player was host, seeker, or hider. Note the current phase,
network change, and whether the client attempted `resume_room` or a fresh
`join_room`.

## Why does the seeker see a black screen during Hide?

That is expected. During Hide, the seeker must not see the map or move. This
protects the memory-and-observation loop from the Preview phase.

## What should testers record after each playtest?

Record player count, map, round length, captures, whether attack budget ran out,
survivors, subjective fairness notes, visible errors, FPS, memory, latency, and
package size when available.

## Can testers request new abilities or new maps?

Capture the request as feedback, but do not add it to the MVP release gate.
Phase 07 only tunes existing values and verifies release readiness.

## When should debug logs be enabled?

Keep debug logs off by default. Enable the error log toggle only while
reproducing a specific issue, then turn it off before normal playtest runs.
