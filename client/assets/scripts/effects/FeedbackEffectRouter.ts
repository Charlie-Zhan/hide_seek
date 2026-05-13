import {
  AttackFeedbackOutcome,
  FeedbackEventType,
  MatchOutcome,
  type FeedbackEvent
} from './FeedbackEvents';

export enum EffectCueId {
  ButtonPress = 'effect_button_press',
  CountdownPulse = 'effect_countdown_pulse',
  CountdownUrgentPulse = 'effect_countdown_urgent_pulse',
  DisguiseIconSwap = 'effect_disguise_icon_swap',
  AttackSectorSweep = 'effect_attack_sector_sweep',
  AttackPropImpact = 'effect_attack_prop_impact',
  AttackCaptureImpact = 'effect_attack_capture_impact',
  AttackMissRipple = 'effect_attack_miss_ripple',
  AttacksDepletedNotice = 'effect_attacks_depleted_notice',
  PropBreakFragments = 'effect_prop_break_fragments',
  CapturedBadge = 'effect_captured_badge',
  RoundStartBanner = 'effect_round_start_banner',
  RoundEndBanner = 'effect_round_end_banner',
  VictoryBanner = 'effect_victory_banner',
  DefeatBanner = 'effect_defeat_banner'
}

export interface EffectCue {
  readonly id: EffectCueId;
  readonly intensity: 'subtle' | 'normal' | 'strong';
  readonly notes: string;
}

export interface EffectRoute {
  readonly eventType: FeedbackEventType;
  readonly cues: readonly EffectCue[];
}

export class FeedbackEffectRouter {
  public route(event: FeedbackEvent): EffectRoute {
    return {
      eventType: event.type,
      cues: this.getCues(event)
    };
  }

  private getCues(event: FeedbackEvent): readonly EffectCue[] {
    switch (event.type) {
      case FeedbackEventType.ButtonClick:
        return [cue(EffectCueId.ButtonPress, 'subtle', 'Small button scale or tint response.')];
      case FeedbackEventType.CountdownTick:
        return [
          cue(
            event.secondsRemaining <= 5 ? EffectCueId.CountdownUrgentPulse : EffectCueId.CountdownPulse,
            event.secondsRemaining <= 5 ? 'strong' : 'normal',
            'Timer text pulse without blocking gameplay visibility.'
          )
        ];
      case FeedbackEventType.DisguiseSwitched:
        return [cue(EffectCueId.DisguiseIconSwap, 'subtle', 'Immediate prop icon/sprite swap only.')];
      case FeedbackEventType.AttackResolved:
        return this.getAttackCues(event.outcome, event.remainingAttacks);
      case FeedbackEventType.PropBroken:
        return [cue(EffectCueId.PropBreakFragments, 'normal', 'Small pooled fragments for confirmed prop break.')];
      case FeedbackEventType.HiderCaptured:
        return [cue(EffectCueId.CapturedBadge, 'strong', 'Clear captured marker for the caught hider.')];
      case FeedbackEventType.RoundStarted:
        return [cue(EffectCueId.RoundStartBanner, 'normal', 'Short phase banner and HUD pulse.')];
      case FeedbackEventType.RoundEnded:
        return [cue(EffectCueId.RoundEndBanner, 'normal', 'Short result transition banner.')];
      case FeedbackEventType.MatchOutcome:
        return [
          cue(
            event.outcome === MatchOutcome.Victory ? EffectCueId.VictoryBanner : EffectCueId.DefeatBanner,
            'strong',
            'Result panel emphasis only.'
          )
        ];
    }
  }

  private getAttackCues(outcome: AttackFeedbackOutcome, remainingAttacks: number): readonly EffectCue[] {
    const sweep = cue(EffectCueId.AttackSectorSweep, 'normal', 'Brief visible sector sweep in seeker facing direction.');
    const depleted =
      remainingAttacks <= 0 && outcome !== AttackFeedbackOutcome.AttacksDepleted
        ? [cue(EffectCueId.AttacksDepletedNotice, 'strong', 'Remaining attack counter reaches zero.')]
        : [];

    if (outcome === AttackFeedbackOutcome.HiderHit) {
      return [sweep, cue(EffectCueId.AttackCaptureImpact, 'strong', 'Capture impact layered over sector sweep.'), ...depleted];
    }

    if (outcome === AttackFeedbackOutcome.PropHit) {
      return [sweep, cue(EffectCueId.AttackPropImpact, 'normal', 'Prop impact flash within the sector.'), ...depleted];
    }

    if (outcome === AttackFeedbackOutcome.AttacksDepleted) {
      return [sweep, cue(EffectCueId.AttacksDepletedNotice, 'strong', 'Remaining attack counter reaches zero.')];
    }

    return [sweep, cue(EffectCueId.AttackMissRipple, 'subtle', 'Light miss ripple without implying a hit.'), ...depleted];
  }
}

function cue(id: EffectCueId, intensity: EffectCue['intensity'], notes: string): EffectCue {
  return { id, intensity, notes };
}
