import type { RoundPhase } from '../types/round.js';

export type GameEventType =
  | 'phase_changed'
  | 'attack'
  | 'props_destroyed'
  | 'prop_broken'
  | 'hider_captured'
  | 'v2_objective_completed'
  | 'v2_event_hint'
  | 'v2_event_active'
  | 'v2_event_ended'
  | 'round_ended'
  | 'score_changed';

export type RoundEndReason =
  | 'time_up'
  | 'attacks_used'
  | 'all_captured'
  | 'seeker_disconnected';

export type LegacyRoundEndReason =
  | 'attack_count_empty'
  | 'all_hiders_captured';

export interface GameEventBase {
  id?: string;
  type: GameEventType;
  serverTimeMs?: number;
}

export interface PhaseChangedEvent extends GameEventBase {
  type: 'phase_changed';
  phase: RoundPhase;
  phaseEndsAtMs?: number;
}

export interface AttackEvent extends GameEventBase {
  type: 'attack';
  attackerId: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
}

export interface PropsDestroyedEvent extends GameEventBase {
  type: 'props_destroyed';
  propIds: string[];
}

export interface PropBrokenEvent extends GameEventBase {
  type: 'prop_broken';
  propInstanceId: string;
  attackerPlayerId: string;
}

export type HiderCapturedEvent =
  | (GameEventBase & {
      type: 'hider_captured';
      hiderId: string;
      by: string;
      hiderPlayerId?: string;
      seekerPlayerId?: string;
    })
  | (GameEventBase & {
      type: 'hider_captured';
      hiderId?: string;
      by?: string;
      hiderPlayerId: string;
      seekerPlayerId: string;
    });

export interface RoundEndedEvent extends GameEventBase {
  type: 'round_ended';
  roundIndex?: number;
  reason: RoundEndReason | LegacyRoundEndReason;
}

export interface ScoreChangedEvent extends GameEventBase {
  type: 'score_changed';
  scores: Record<string, number>;
}

export interface V2ObjectiveCompletedEvent extends GameEventBase {
  type: 'v2_objective_completed';
  hiderId: string;
  objectiveId: string;
  reward: number;
}

export interface V2EventHintEvent extends GameEventBase {
  type: 'v2_event_hint';
  eventId: string;
  eventType: 'local_disruption';
  startsInMs: number;
}

export interface V2EventActiveEvent extends GameEventBase {
  type: 'v2_event_active';
  eventId: string;
  eventType: 'local_disruption';
}

export interface V2EventEndedEvent extends GameEventBase {
  type: 'v2_event_ended';
  eventId: string;
  eventType: 'local_disruption';
}

export type GameEvent =
  | PhaseChangedEvent
  | AttackEvent
  | PropsDestroyedEvent
  | PropBrokenEvent
  | HiderCapturedEvent
  | V2ObjectiveCompletedEvent
  | V2EventHintEvent
  | V2EventActiveEvent
  | V2EventEndedEvent
  | RoundEndedEvent
  | ScoreChangedEvent;
