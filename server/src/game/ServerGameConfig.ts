import type { GameConfig } from './ServerGameTypes.js';

export const SERVER_GAME_CONFIG: GameConfig = {
  previewDurationMs: 5000,
  hideDurationMs: 12000,
  seekDurationMs: 45000,
  resultDurationMs: 5000,
  attackSectorDeg: 90,
  attackRadiusPx: 120,
  attackCountMultiplier: 2,
  hiderHideSpeed: 220,
  hiderSeekSpeed: 90,
  seekerSpeed: 220,
  v2ObjectivesEnabled: false,
  v2EventsEnabled: false,
  v2ObjectiveHoldMs: 2000,
  v2ObjectiveRadiusPx: 24,
  v2ObjectiveRewardScore: 1,
  v2EventStartDelayMs: 5000,
  v2EventDurationMs: 3000,
  v2EventRadiusPx: 56,
};
