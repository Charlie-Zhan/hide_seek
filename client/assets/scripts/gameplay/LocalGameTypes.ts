import type { GameConfig, PropConfig, RoundEndReason as SharedRoundEndReason, Vector2 } from '@prop-hide-seek/shared';
import { PlayerRole, PlayerState, RoundPhase } from '@prop-hide-seek/shared';

export { PlayerRole, PlayerState, RoundPhase };
export type { GameConfig, PropConfig, Vector2 };

export interface LocalPlayer {
  playerId: string;
  displayName: string;
  role: PlayerRole;
  state: PlayerState;
  score: number;
  position: Vector2;
  facing: Vector2;
  currentPropId: string;
  captured: boolean;
}

export interface LocalPropInstance {
  instanceId: string;
  propId: string;
  position: Vector2;
  radius: number;
  breakable: boolean;
  destroyed: boolean;
  blocksMovement?: boolean;
}

export interface LocalCollisionRect {
  id: string;
  position: Vector2;
  size: {
    width: number;
    height: number;
  };
  blocksMovement: boolean;
  allowsOverlap: boolean;
}

export interface LocalMovementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LocalRoundScoreDelta {
  playerId: string;
  delta: number;
  reason: 'seeker_capture' | 'seeker_all_caught_bonus' | 'hider_survived';
}

export interface LocalRoundResult {
  roundIndex: number;
  seekerId: string;
  capturedHiderIds: string[];
  survivingHiderIds: string[];
  scoreDeltas: LocalRoundScoreDelta[];
  endedReason: RoundEndReason;
}

export interface LocalAttackResult {
  accepted: boolean;
  reason?: string;
  remainingAttacks: number;
  destroyedPropIds: string[];
  capturedPlayerIds: string[];
  endedRound: boolean;
}

export type RoundEndReason = SharedRoundEndReason;

export interface LocalGameSnapshot {
  phase: RoundPhase;
  roundIndex: number;
  seekerIndex: number;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  attackCountRemaining: number;
  players: LocalPlayer[];
  props: LocalPropInstance[];
  lastRoundResult: LocalRoundResult | null;
  matchEnded: boolean;
}

export interface LocalGameSetup {
  gameConfig: GameConfig;
  mapSize?: {
    width: number;
    height: number;
  };
  movementBounds?: LocalMovementBounds;
  seekerSpawnPoint?: Vector2;
  spawnPoints?: Vector2[];
  players: Array<{
    playerId: string;
    displayName: string;
    startPosition?: Vector2;
    startFacing?: Vector2;
    initialPropId?: string;
  }>;
  availablePropIds: string[];
  props?: LocalPropInstance[];
  obstacles?: LocalCollisionRect[];
  hideIdleDisguiseMs?: number;
}

export interface PlayerMovementInput {
  playerId: string;
  direction: Vector2;
}

export const DEFAULT_HIDE_IDLE_DISGUISE_MS = 250;
export const DEFAULT_PLAYER_RADIUS_PX = 18;
export const MIN_LOCAL_PLAYERS = 2;
export const MAX_LOCAL_PLAYERS = 4;

