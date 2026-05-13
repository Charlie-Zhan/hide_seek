# Phase 06 UI/UX/Audio Polish Checklist

## Scope

Readability, controls feedback, round-state messaging, result clarity, and audio cues for the existing MVP gameplay loop. This phase must not change scoring, attack count formula, role rules, room flow, or server authority.

## Manual Checks

- Lobby UI shows the game title, player name entry, create room, join room, and a short how-to-play entry.
- Room UI shows the room code prominently, player list, ready state, share button, start button, back to Lobby, and network status.
- Seeker Game HUD shows phase, countdown, remaining attacks, captured hider count, and current score.
- Hider Game HUD shows phase, countdown, current prop name or icon, captured state, and current score.
- Preview shows a clear prompt to observe the map and remember prop positions; player characters are hidden and the map remains readable.
- Hide seeker screen fully hides the map and shows only a static blind overlay plus countdown.
- Seek attack feedback shows a clear fan-shaped swing, prop break feedback, hider capture emphasis, miss feedback, and attack-depleted prompt.
- Disguise switch feedback changes the hider appearance immediately with only a small UI/icon change; no oversized smoke or rule-changing effect.
- Result panel shows captured hider count, surviving hiders, round score deltas, total ranking, and next seeker.
- Full match result shows total ranking, optional MVP labels such as best hider
  or best seeker, and a restart-room control for the supported MatchEnd restart
  flow.
- Countdown last 5 seconds has a readable emphasis without hiding gameplay.
- Captured or spectating players cannot confuse the UI for active controls.
- UI remains readable on phone-sized landscape screens and does not cover the core play area.
- Audio cues exist for button click, countdown, prop switch, attack, prop break, hider capture, round start, round end, victory, and defeat.
- Kenney or placeholder UI/effect/audio assets have source and license notes before being promoted out of placeholders.
- Forbidden MVP features remain absent from UI copy and feedback: seeker scan, sprint/dash, container hiding, tasks, random events, paid skins, seasons, ranking progression, and P2P.

## Playtest Record Template

```text
Date:
Build:
Device(s):
Players:
Map:

New player understood basic controls within 1 minute: yes/no
Seeker understood only movement plus fan attack: yes/no
Hider understood movement plus prop switch: yes/no
Remaining attacks were obvious: yes/no
Hide blind overlay fully hid the map: yes/no
Attack feedback made hit/miss/capture clear: yes/no
Score changes were clear: yes/no
UI blocked core gameplay: yes/no
Audio cues were present and not misleading: yes/no

Issues found:
Follow-up owner:
```

## Automated Checks

Run:

```bash
npm run test
npm run typecheck
npm run validate:phase06
```
