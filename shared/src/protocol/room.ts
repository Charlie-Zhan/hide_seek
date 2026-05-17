import type { RoundPhase } from '../types/round.js';
import type { PublicPlayerState } from '../types/player.js';
import type { Vector2 } from '../types/geometry.js';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type PublicRoomStatus = RoomStatus;

export interface PublicRoomPlayer {
  playerId: string;
  playerName: string;
  displayName: string;
  ready: boolean;
  connected: boolean;
  isOwner: boolean;
}

export interface PublicRoomState {
  roomId: string;
  status: PublicRoomStatus;
  mapId: string;
  maxPlayers: number;
  minPlayers: number;
  players: PublicRoomPlayer[];
  ownerPlayerId?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type RoomPlayer = PublicRoomPlayer;
export type RoomState = PublicRoomState;

export interface PublicPropState {
  propInstanceId: string;
  propConfigId: string;
  configId?: string;
  position: Vector2;
  radius?: number;
  rotationDeg: number;
  isDestroyed: boolean;
  destroyed?: boolean;
  isBreakable?: boolean;
  blocksMovement?: boolean;
}

export interface RoomStateSnapshot {
  roomId: string;
  status: RoomStatus;
  mapId: string;
  roundIndex: number;
  seekerPlayerId?: string;
  phase: RoundPhase;
  phaseEndsAtMs?: number;
  players: PublicPlayerState[];
  props: PublicPropState[];
  scores: Record<string, number>;
}
