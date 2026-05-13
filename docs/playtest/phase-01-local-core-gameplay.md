# Phase 01 Local Core Gameplay Checklist

## Scope

Local-only prototype for phase flow, hider disguise, seeker sector attack, finite attack count, and basic scoring.

## Manual Checks

- Preview hides all players and ignores input.
- Hide blocks seeker input and allows hider movement at hide speed.
- Hide auto-disguises idle hiders after the configured threshold.
- Hider prop switching has no cooldown.
- Seek allows seeker movement and sector attacks.
- Seek keeps hiders in prop form while moving slowly.
- One sector attack can destroy multiple breakable props.
- One sector attack can capture hiders in range.
- Search ends when attacks run out or all hiders are captured.
- Scores follow the MVP rules.
- Debug control can rotate the controlled player and advance phases.

## Automated Checks

Run:

```bash
npm run test --workspace @prop-hide-seek/client
npm run typecheck
npm run validate:phase01
```
