import type { GameConfig, PropConfig, Vector2 } from '@prop-hide-seek/shared';
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

export type RoundEndReason = 'timer_expired' | 'attacks_depleted' | 'all_hiders_captured' | 'debug_skip';

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
  players: Array<{
    playerId: string;
    displayName: string;
    startPosition?: Vector2;
    startFacing?: Vector2;
    initialPropId?: string;
  }>;
  availablePropIds: string[];
  props?: LocalPropInstance[];
  hideIdleDisguiseMs?: number;
}

export interface PlayerMovementInput {
  playerId: string;
  direction: Vector2;
}

export const DEFAULT_HIDE_IDLE_DISGUISE_MS = 250;
export const DEFAULT_PLAYER_RADIUS_PX = 18;

