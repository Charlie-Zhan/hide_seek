# Phase 07 Performance And Package Log

## Performance Record Fields

Use one row per build and test device.

| Date | Build | Device | OS | Network | Players | Map | WeChat DevTools FPS | Device FPS | Memory MB | WebSocket Average Latency MS | Messages Per Match | Crash Or Stall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  | kitchen_01 |  |  |  |  |  |  |

Required notes:

- WeChat DevTools FPS is a development signal only.
- Device FPS is the release gate signal.
- Memory MB can be approximate if the device tool only exposes a range.
- WebSocket Average Latency MS should be measured across a full match.
- Messages Per Match should include room and gameplay messages.

## First Package Size

Record size after exporting from Cocos Creator 3.x to WeChat Minigame.

| Date | Build | Export path | Actual WeChat package size | First package contents changed | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  | no |  |

Expected first package boundary:

- Startup flow.
- Lobby and room UI.
- First playable map `kitchen_01`.
- Core character and prop metadata.
- Base UI, input, and network scripts.
- Purpose-specific atlas metadata and approved first-map assets only.

Keep out of the first package:

- Future maps.
- Cosmetic assets.
- Raw Kenney source archives.
- Long audio files.
- Release-only debug captures.

## Error Summary

| Date | Build | Severity | Area | Symptom | Repro steps | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |
