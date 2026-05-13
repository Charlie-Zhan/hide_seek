import {
  AttackFeedbackOutcome,
  FeedbackEventType,
  MatchOutcome,
  type FeedbackEvent
} from '../effects/FeedbackEvents';
import { AUDIO_CUE_CATALOG, AudioCueId, type AudioCueDefinition } from './AudioCueCatalog';

export interface AudioPlaybackRequest {
  readonly cue: AudioCueDefinition;
  readonly eventType: FeedbackEventType;
}

export class FeedbackAudioRouter {
  public route(event: FeedbackEvent): readonly AudioPlaybackRequest[] {
    return this.getCueIds(event).map((cueId) => ({
      cue: AUDIO_CUE_CATALOG[cueId],
      eventType: event.type
    }));
  }

  private getCueIds(event: FeedbackEvent): readonly AudioCueId[] {
    switch (event.type) {
      case FeedbackEventType.ButtonClick:
        return [AudioCueId.ButtonClick];
      case FeedbackEventType.CountdownTick:
        return [event.secondsRemaining <= 5 ? AudioCueId.CountdownFinalTick : AudioCueId.CountdownTick];
      case FeedbackEventType.DisguiseSwitched:
        return [AudioCueId.DisguiseSwitch];
      case FeedbackEventType.AttackResolved:
        return this.getAttackCueIds(event.outcome, event.remainingAttacks);
      case FeedbackEventType.PropBroken:
        return [AudioCueId.PropBreak];
      case FeedbackEventType.HiderCaptured:
        return [AudioCueId.Capture];
      case FeedbackEventType.RoundStarted:
        return [AudioCueId.RoundStart];
      case FeedbackEventType.RoundEnded:
        return [AudioCueId.RoundEnd];
      case FeedbackEventType.MatchOutcome:
        return [event.outcome === MatchOutcome.Victory ? AudioCueId.Victory : AudioCueId.Defeat];
    }
  }

  private getAttackCueIds(outcome: AttackFeedbackOutcome, remainingAttacks: number): readonly AudioCueId[] {
    const depleted =
      remainingAttacks <= 0 && outcome !== AttackFeedbackOutcome.AttacksDepleted ? [AudioCueId.AttackDepleted] : [];

    if (outcome === AttackFeedbackOutcome.HiderHit) {
      return [AudioCueId.AttackSwing, AudioCueId.AttackHiderHit, ...depleted];
    }

    if (outcome === AttackFeedbackOutcome.PropHit) {
      return [AudioCueId.AttackSwing, AudioCueId.AttackPropHit, ...depleted];
    }

    if (outcome === AttackFeedbackOutcome.AttacksDepleted) {
      return [AudioCueId.AttackSwing, AudioCueId.AttackDepleted];
    }

    return [AudioCueId.AttackSwing, AudioCueId.AttackMiss, ...depleted];
  }
}
