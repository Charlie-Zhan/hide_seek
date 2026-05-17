import { RoundPhase, type RoundEndReason } from '../gameplay/LocalGameTypes';

export enum FeedbackEventType {
  ButtonClick = 'button_click',
  CountdownTick = 'countdown_tick',
  DisguiseSwitched = 'disguise_switched',
  AttackResolved = 'attack_resolved',
  PropBroken = 'prop_broken',
  HiderCaptured = 'hider_captured',
  RoundStarted = 'round_started',
  RoundEnded = 'round_ended',
  MatchOutcome = 'match_outcome'
}

export enum AttackFeedbackOutcome {
  PropHit = 'prop_hit',
  HiderHit = 'hider_hit',
  Miss = 'miss',
  AttacksDepleted = 'attacks_depleted'
}

export enum MatchOutcome {
  Victory = 'victory',
  Defeat = 'defeat'
}

export interface FeedbackEventBase {
  readonly type: FeedbackEventType;
}

export interface ButtonClickFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.ButtonClick;
  readonly buttonId: string;
}

export interface CountdownTickFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.CountdownTick;
  readonly phase: RoundPhase;
  readonly secondsRemaining: number;
}

export interface DisguiseSwitchedFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.DisguiseSwitched;
  readonly playerId: string;
  readonly propId: string;
}

export interface AttackResolvedFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.AttackResolved;
  readonly outcome: AttackFeedbackOutcome;
  readonly remainingAttacks: number;
}

export interface PropBrokenFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.PropBroken;
  readonly propInstanceId: string;
  readonly propId: string;
}

export interface HiderCapturedFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.HiderCaptured;
  readonly hiderId: string;
}

export interface RoundStartedFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.RoundStarted;
  readonly phase: RoundPhase;
  readonly roundIndex: number;
}

export interface RoundEndedFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.RoundEnded;
  readonly roundIndex: number;
  readonly reason: RoundEndReason;
}

export interface MatchOutcomeFeedbackEvent extends FeedbackEventBase {
  readonly type: FeedbackEventType.MatchOutcome;
  readonly outcome: MatchOutcome;
}

export type FeedbackEvent =
  | ButtonClickFeedbackEvent
  | CountdownTickFeedbackEvent
  | DisguiseSwitchedFeedbackEvent
  | AttackResolvedFeedbackEvent
  | PropBrokenFeedbackEvent
  | HiderCapturedFeedbackEvent
  | RoundStartedFeedbackEvent
  | RoundEndedFeedbackEvent
  | MatchOutcomeFeedbackEvent;

export function createAttackFeedback(input: {
  readonly destroyedPropIds?: readonly string[];
  readonly capturedPlayerIds?: readonly string[];
  readonly remainingAttacks: number;
}): AttackResolvedFeedbackEvent {
  if ((input.capturedPlayerIds?.length ?? 0) > 0) {
    return {
      type: FeedbackEventType.AttackResolved,
      outcome: AttackFeedbackOutcome.HiderHit,
      remainingAttacks: input.remainingAttacks
    };
  }

  if ((input.destroyedPropIds?.length ?? 0) > 0) {
    return {
      type: FeedbackEventType.AttackResolved,
      outcome: AttackFeedbackOutcome.PropHit,
      remainingAttacks: input.remainingAttacks
    };
  }

  if (input.remainingAttacks <= 0) {
    return {
      type: FeedbackEventType.AttackResolved,
      outcome: AttackFeedbackOutcome.AttacksDepleted,
      remainingAttacks: input.remainingAttacks
    };
  }

  return {
    type: FeedbackEventType.AttackResolved,
    outcome: AttackFeedbackOutcome.Miss,
    remainingAttacks: input.remainingAttacks
  };
}
