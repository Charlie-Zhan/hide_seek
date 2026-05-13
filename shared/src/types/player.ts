import type { Vector2 } from './geometry.js';

export enum PlayerRole {
  Seeker = 'seeker',
  Hider = 'hider',
}

export enum PlayerState {
  InvisibleInPreview = 'invisible_in_preview',
  SeekerLocked = 'seeker_locked',
  HiderMovingAsCharacter = 'hider_moving_as_character',
  HiderDisguisedIdle = 'hider_disguised_idle',
  HiderDisguisedMoving = 'hider_disguised_moving',
  Captured = 'captured',
}

export interface PublicPlayerState {
  playerId: string;
  displayName: string;
  role: PlayerRole;
  state: PlayerState;
  position: Vector2;
  facing?: Vector2;
  facingDeg: number;
  currentPropId?: string;
  captured?: boolean;
  score: number;
  connected?: boolean;
}
