export enum RoundPhase {
  Preview = 'preview',
  Hide = 'hide',
  Seek = 'seek',
  Result = 'result',
  MatchEnd = 'match_end',
}

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

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface GameConfig {
  readonly previewDurationMs: number;
  readonly hideDurationMs: number;
  readonly seekDurationMs: number;
  readonly resultDurationMs: number;
  readonly attackSectorDeg: number;
  readonly attackRadiusPx: number;
  readonly attackCountMultiplier: number;
  readonly hiderHideSpeed: number;
  readonly hiderSeekSpeed: number;
  readonly seekerSpeed: number;
  readonly v2ObjectivesEnabled: boolean;
  readonly v2EventsEnabled: boolean;
  readonly v2ObjectiveHoldMs: number;
  readonly v2ObjectiveRadiusPx: number;
  readonly v2ObjectiveRewardScore: number;
  readonly v2EventStartDelayMs: number;
  readonly v2EventDurationMs: number;
  readonly v2EventRadiusPx: number;
}

export type PlayerInputAction = 'switch_prop' | 'attack';

export interface PlayerInputIntent {
  readonly seq?: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly action?: PlayerInputAction;
}

export interface MatchPlayerSetup {
  readonly playerId: string;
  readonly displayName: string;
}

export interface ServerPropInstance {
  readonly propInstanceId: string;
  readonly propConfigId: string;
  readonly position: Vector2;
  readonly radius: number;
  readonly breakable: boolean;
  destroyed: boolean;
}

export interface ServerMapFixture {
  readonly mapId: string;
  readonly width: number;
  readonly height: number;
  readonly seekerSpawn: Vector2;
  readonly seekerFacing: Vector2;
  readonly hiderSpawns: Vector2[];
  readonly propPool: string[];
  readonly propRadiusById: Record<string, number>;
  readonly props: ServerPropInstance[];
  readonly v2ObjectivePoints?: Vector2[];
  readonly v2EventZones?: Vector2[];
}

export type RoundEndReason = 'time_up' | 'attacks_used' | 'all_captured' | 'seeker_disconnected';

export interface MatchEventMeta {
  readonly id: string;
  readonly serverTimeMs: number;
}

export type MatchEventPayload =
  | { readonly type: 'phase_changed'; readonly phase: RoundPhase; readonly roundIndex: number }
  | {
      readonly type: 'attack';
      readonly attackerId: string;
      readonly x: number;
      readonly y: number;
      readonly facingX: number;
      readonly facingY: number;
      readonly remainingAttacks: number;
    }
  | { readonly type: 'props_destroyed'; readonly propIds: string[] }
  | { readonly type: 'hider_captured'; readonly hiderId: string; readonly by: string }
  | { readonly type: 'v2_objective_completed'; readonly hiderId: string; readonly objectiveId: string; readonly reward: number }
  | { readonly type: 'v2_event_hint'; readonly eventId: string; readonly eventType: string; readonly startsInMs: number }
  | { readonly type: 'v2_event_active'; readonly eventId: string; readonly eventType: string }
  | { readonly type: 'v2_event_ended'; readonly eventId: string; readonly eventType: string }
  | { readonly type: 'round_ended'; readonly roundIndex: number; readonly reason: RoundEndReason }
  | { readonly type: 'score_changed'; readonly scores: Record<string, number> };

export type MatchEvent = MatchEventMeta & MatchEventPayload;

export interface PublicMatchPlayerState {
  readonly playerId: string;
  readonly displayName: string;
  readonly role: PlayerRole;
  readonly state: PlayerState;
  readonly position: Vector2;
  readonly facing: Vector2;
  readonly facingDeg: number;
  readonly currentPropId?: string;
  readonly captured: boolean;
  readonly isMoving: boolean;
  readonly score: number;
  readonly connected: boolean;
}

export interface PublicMatchPropState {
  readonly propInstanceId: string;
  readonly propConfigId: string;
  readonly position: Vector2;
  readonly rotationDeg: number;
  readonly isDestroyed: boolean;
}

export type PublicV2ObjectiveState = {
  readonly objectiveId: string;
  readonly objectiveType: 'hold_point';
  readonly position: Vector2;
  readonly radius: number;
  readonly requiredHoldMs: number;
  readonly progressMs: number;
  readonly completed: boolean;
  readonly completedBy?: string;
  readonly reward: number;
};

export type PublicV2EventStatus = 'hint' | 'active' | 'ended';

export interface PublicV2EventState {
  readonly eventId: string;
  readonly eventType: 'local_disruption';
  readonly status: PublicV2EventStatus;
  readonly position: Vector2;
  readonly radius: number;
  readonly startsAtMs: number;
  readonly endsAtMs: number;
}

export interface MatchSnapshot {
  readonly type: 'state';
  readonly serverTick: number;
  readonly roomId: string;
  readonly mapId: string;
  readonly phase: RoundPhase;
  readonly roundIndex: number;
  readonly seekerPlayerId?: string;
  readonly timeLeftMs: number;
  readonly attackCountRemaining: number;
  readonly players: PublicMatchPlayerState[];
  readonly props: PublicMatchPropState[];
  readonly events: MatchEvent[];
  readonly v2Objectives: PublicV2ObjectiveState[];
  readonly v2Events: PublicV2EventState[];
  readonly scores: Record<string, number>;
  readonly matchEnded: boolean;
}
