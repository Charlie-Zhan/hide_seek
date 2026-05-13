# PR Ready Checklist

Use this checklist before marking a Phase 07 or real-device readiness PR as
ready for review. Do not claim real-device or WeChat completion unless the
fields below are filled from an actual run.

## Automated Commands

Run from the repository root:

```bash
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lan:endpoints
npm.cmd run smoke:local-ws
npm.cmd run smoke:lan-ws
npm.cmd run validate:ready-pr
npm.cmd run docker:smoke
npm.cmd run validate:phase07
npm.cmd run validate:phase08
```

Record results:

| Command | Result | Notes |
|---|---|---|
| `npm.cmd run test` | pass / fail / not run |  |
| `npm.cmd run typecheck` | pass / fail / not run |  |
| `npm.cmd run lan:endpoints` | pass / fail / not run |  |
| `npm.cmd run smoke:local-ws` | pass / fail / not run |  |
| `npm.cmd run smoke:lan-ws` | pass / fail / not run |  |
| `npm.cmd run validate:ready-pr` | pass / fail / not run |  |
| `npm.cmd run docker:smoke` | pass / fail / not run |  |
| `npm.cmd run validate:phase07` | pass / fail / not run |  |
| `npm.cmd run validate:phase08` | pass / fail / not run |  |

## Smoke Commands

Run the smallest relevant smoke for the touched area. Examples:

```bash
npm.cmd run test --workspace server -- --runInBand
npm.cmd run typecheck --workspace shared
npm.cmd run typecheck --workspace server
```

Record:

| Smoke target | Command | Result | Notes |
|---|---|---|---|
| Server room/reconnect smoke |  | pass / fail / not run |  |
| Shared protocol typecheck |  | pass / fail / not run |  |
| Client build or Cocos export smoke |  | pass / fail / not run |  |
| Docker clean environment smoke | `npm.cmd run docker:smoke` | pass / fail / not run |  |

## Real Device Required Fields

These fields are mandatory for any PR that claims real-device readiness:

```text
Real-device session template path:
Build / commit:
Server endpoint:
Docker image tag:
Docker smoke result:
WebSocket URL label:
Runtime override path:
Storage key prop_hide_seek_room_server_url:
Cocos export path:
WeChat DevTools import path:
First package size:
Device FPS average:
Device memory MB:
Average latency ms:
Room code:
Player count:
Same Wi-Fi result:
Different network result:
Weak network result:
Share entry result:
Hider reconnect result:
Seeker reconnect result:
Restart another match result:
MVP V2 default-off result:
Explicit V2 room result, if run:
Blocking issue count:
```

If any value is missing, write `not run` or `unknown`; do not replace it with
assumptions from simulator, browser, or automated tests.

## Release Gate

- [ ] Share entry carries `roomId` and a second physical device joins the same
      room.
- [ ] Two phones on the same Wi-Fi complete at least one full match.
- [ ] Different-network or remote `wss` test result is recorded.
- [ ] Runtime WebSocket override is recorded and matches the tested endpoint.
- [ ] Weak-network behavior is recorded.
- [ ] Hider reconnect and seeker reconnect are recorded.
- [ ] A second match or room starts cleanly after MatchEnd.
- [ ] Server authority is preserved for phase, attack hits, captures, round end,
      and score.
- [ ] First package size is recorded from the WeChat Mini Game export.
- [ ] FPS, memory, and average latency are recorded from real devices.
- [ ] V2 flags are verified off in default MVP rooms.
- [ ] Explicit V2-on behavior, if tested, is recorded separately and not used as
      MVP release proof.
- [ ] No MVP-forbidden gameplay or product scope was introduced.

## Known Not Finished Until Recorded

Keep these as known incomplete items unless the current PR includes evidence:

- Formal Kenney art import and license verification for real art bytes.
- Real-device FPS and memory numbers across representative low and mid devices.
- Actual WeChat first package size from the exported Mini Game project.
- Cross-network `wss` connection stability.
- Share-card entry on physical phones.
- Reconnect recovery on physical phones for both hider and seeker.
- Full 4-player balance sample size from the Phase 07 balance template.

## PR Description Guardrail

Allowed wording:

```text
Added real-device test runbook and session template.
Automated validators pass.
Real-device checks are documented and remain not run until a tester fills the
session template.
```

Avoid wording that claims completion without evidence:

```text
Real-device testing completed.
WeChat release is ready.
FPS is acceptable.
Cross-network play is stable.
```
