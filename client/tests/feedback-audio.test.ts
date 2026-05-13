import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUDIO_CUE_CATALOG, AudioCueId, REQUIRED_AUDIO_CUE_IDS } from '../assets/scripts/audio/AudioCueCatalog';
import { FeedbackAudioRouter } from '../assets/scripts/audio/FeedbackAudioRouter';
import { EffectCueId, FeedbackEffectRouter } from '../assets/scripts/effects/FeedbackEffectRouter';
import {
  AttackFeedbackOutcome,
  FeedbackEventType,
  MatchOutcome,
  createAttackFeedback,
  type FeedbackEvent
} from '../assets/scripts/effects/FeedbackEvents';
import { RoundPhase } from '../assets/scripts/gameplay/LocalGameTypes';

describe('Phase 06 feedback and audio routing', () => {
  it('has a placeholder catalog entry for every routed audio cue without bundling unlicensed sources', () => {
    assert.deepEqual(Object.keys(AUDIO_CUE_CATALOG).sort(), [...REQUIRED_AUDIO_CUE_IDS].sort());

    for (const cueId of REQUIRED_AUDIO_CUE_IDS) {
      const cue = AUDIO_CUE_CATALOG[cueId];
      assert.equal(cue.sourceStatus, 'placeholder_only');
      assert.match(cue.placeholderPath, /^client\/assets\/audio\/sfx\/sfx_[a-z_]+\.wav$/);
      assert.ok(cue.volume > 0 && cue.volume <= 1);
    }
  });

  it('routes required non-attack feedback events to audio cues', () => {
    const router = new FeedbackAudioRouter();

    assert.deepEqual(cueIds(router, buttonClick()), [AudioCueId.ButtonClick]);
    assert.deepEqual(cueIds(router, countdown(8)), [AudioCueId.CountdownTick]);
    assert.deepEqual(cueIds(router, countdown(5)), [AudioCueId.CountdownFinalTick]);
    assert.deepEqual(cueIds(router, disguiseSwitched()), [AudioCueId.DisguiseSwitch]);
    assert.deepEqual(cueIds(router, propBroken()), [AudioCueId.PropBreak]);
    assert.deepEqual(cueIds(router, hiderCaptured()), [AudioCueId.Capture]);
    assert.deepEqual(cueIds(router, roundStarted()), [AudioCueId.RoundStart]);
    assert.deepEqual(cueIds(router, roundEnded()), [AudioCueId.RoundEnd]);
    assert.deepEqual(cueIds(router, matchOutcome(MatchOutcome.Victory)), [AudioCueId.Victory]);
    assert.deepEqual(cueIds(router, matchOutcome(MatchOutcome.Defeat)), [AudioCueId.Defeat]);
  });

  it('distinguishes attack miss, prop hit, hider hit, and depleted attacks', () => {
    const router = new FeedbackAudioRouter();

    assert.deepEqual(cueIds(router, attack(AttackFeedbackOutcome.Miss)), [
      AudioCueId.AttackSwing,
      AudioCueId.AttackMiss
    ]);
    assert.deepEqual(cueIds(router, attack(AttackFeedbackOutcome.PropHit)), [
      AudioCueId.AttackSwing,
      AudioCueId.AttackPropHit
    ]);
    assert.deepEqual(cueIds(router, attack(AttackFeedbackOutcome.HiderHit)), [
      AudioCueId.AttackSwing,
      AudioCueId.AttackHiderHit
    ]);
    assert.deepEqual(cueIds(router, attack(AttackFeedbackOutcome.AttacksDepleted)), [
      AudioCueId.AttackSwing,
      AudioCueId.AttackDepleted
    ]);
  });

  it('derives attack feedback outcomes from server-authoritative result summaries', () => {
    assert.equal(createAttackFeedback({ remainingAttacks: 2 }).outcome, AttackFeedbackOutcome.Miss);
    assert.equal(
      createAttackFeedback({ destroyedPropIds: ['crate_01'], remainingAttacks: 1 }).outcome,
      AttackFeedbackOutcome.PropHit
    );
    assert.equal(
      createAttackFeedback({ destroyedPropIds: ['crate_01'], capturedPlayerIds: ['p2'], remainingAttacks: 1 }).outcome,
      AttackFeedbackOutcome.HiderHit
    );
    assert.equal(
      createAttackFeedback({ destroyedPropIds: ['crate_01'], remainingAttacks: 0 }).outcome,
      AttackFeedbackOutcome.PropHit
    );
    assert.equal(
      createAttackFeedback({ capturedPlayerIds: ['p2'], remainingAttacks: 0 }).outcome,
      AttackFeedbackOutcome.HiderHit
    );
    assert.equal(
      createAttackFeedback({ remainingAttacks: 0 }).outcome,
      AttackFeedbackOutcome.AttacksDepleted
    );
  });

  it('layers depleted feedback on a final attack without dropping hit feedback', () => {
    const audioRouter = new FeedbackAudioRouter();
    const effectRouter = new FeedbackEffectRouter();
    const finalCapture = createAttackFeedback({ capturedPlayerIds: ['p2'], remainingAttacks: 0 });

    assert.deepEqual(cueIds(audioRouter, finalCapture), [
      AudioCueId.AttackSwing,
      AudioCueId.AttackHiderHit,
      AudioCueId.AttackDepleted
    ]);
    assert.deepEqual(effectIds(effectRouter, finalCapture), [
      EffectCueId.AttackSectorSweep,
      EffectCueId.AttackCaptureImpact,
      EffectCueId.AttacksDepletedNotice
    ]);
  });

  it('keeps disguise visual feedback lightweight and avoids smoke-style cues', () => {
    const router = new FeedbackEffectRouter();
    const route = router.route(disguiseSwitched());

    assert.deepEqual(
      route.cues.map((cue) => cue.id),
      [EffectCueId.DisguiseIconSwap]
    );
    assert.ok(route.cues.every((cue) => cue.intensity === 'subtle'));
    assert.ok(route.cues.every((cue) => !cue.notes.toLowerCase().includes('smoke')));
  });

  it('routes attack visual feedback with clear sector, hit, miss, and depleted states', () => {
    const router = new FeedbackEffectRouter();

    assert.deepEqual(effectIds(router, attack(AttackFeedbackOutcome.Miss)), [
      EffectCueId.AttackSectorSweep,
      EffectCueId.AttackMissRipple
    ]);
    assert.deepEqual(effectIds(router, attack(AttackFeedbackOutcome.PropHit)), [
      EffectCueId.AttackSectorSweep,
      EffectCueId.AttackPropImpact
    ]);
    assert.deepEqual(effectIds(router, attack(AttackFeedbackOutcome.HiderHit)), [
      EffectCueId.AttackSectorSweep,
      EffectCueId.AttackCaptureImpact
    ]);
    assert.deepEqual(effectIds(router, attack(AttackFeedbackOutcome.AttacksDepleted)), [
      EffectCueId.AttackSectorSweep,
      EffectCueId.AttacksDepletedNotice
    ]);
  });
});

function cueIds(router: FeedbackAudioRouter, event: FeedbackEvent): AudioCueId[] {
  return router.route(event).map((request) => request.cue.id);
}

function effectIds(router: FeedbackEffectRouter, event: FeedbackEvent): EffectCueId[] {
  return router.route(event).cues.map((cue) => cue.id);
}

function buttonClick(): FeedbackEvent {
  return {
    type: FeedbackEventType.ButtonClick,
    buttonId: 'attack'
  };
}

function countdown(secondsRemaining: number): FeedbackEvent {
  return {
    type: FeedbackEventType.CountdownTick,
    phase: RoundPhase.Seek,
    secondsRemaining
  };
}

function disguiseSwitched(): FeedbackEvent {
  return {
    type: FeedbackEventType.DisguiseSwitched,
    playerId: 'p2',
    propId: 'wooden_crate'
  };
}

function attack(outcome: AttackFeedbackOutcome): FeedbackEvent {
  return {
    type: FeedbackEventType.AttackResolved,
    outcome,
    remainingAttacks: outcome === AttackFeedbackOutcome.AttacksDepleted ? 0 : 1
  };
}

function propBroken(): FeedbackEvent {
  return {
    type: FeedbackEventType.PropBroken,
    propInstanceId: 'crate_01',
    propId: 'wooden_crate'
  };
}

function hiderCaptured(): FeedbackEvent {
  return {
    type: FeedbackEventType.HiderCaptured,
    hiderId: 'p2'
  };
}

function roundStarted(): FeedbackEvent {
  return {
    type: FeedbackEventType.RoundStarted,
    phase: RoundPhase.Seek,
    roundIndex: 0
  };
}

function roundEnded(): FeedbackEvent {
  return {
    type: FeedbackEventType.RoundEnded,
    reason: 'attacks_depleted',
    roundIndex: 0
  };
}

function matchOutcome(outcome: MatchOutcome): FeedbackEvent {
  return {
    type: FeedbackEventType.MatchOutcome,
    outcome
  };
}
