import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LocalGameEngine } from '../assets/scripts/gameplay/LocalGameEngine';
import {
  PlayerRole,
  PlayerState,
  RoundPhase,
  type GameConfig,
  type LocalGameSetup
} from '../assets/scripts/gameplay/LocalGameTypes';

const TEST_CONFIG: GameConfig = {
  previewDurationMs: 1000,
  hideDurationMs: 1000,
  seekDurationMs: 1000,
  resultDurationMs: 1000,
  attackSectorDeg: 90,
  attackRadiusPx: 120,
  attackCountMultiplier: 2,
  hiderHideSpeed: 200,
  hiderSeekSpeed: 80,
  seekerSpeed: 200
};

describe('LocalGameEngine Phase 01 rules', () => {
  it('keeps Preview players invisible and ignores movement input', () => {
    const engine = createEngine();
    const before = engine.getSnapshot();
    const seeker = before.players[0];

    assert.equal(before.phase, RoundPhase.Preview);
    assert.equal(seeker?.state, PlayerState.InvisibleInPreview);

    engine.setMovementInput({ playerId: 'p1', direction: { x: 1, y: 0 } });
    engine.tick(500);

    const after = engine.getSnapshot().players[0];
    assert.deepEqual(after?.position, seeker?.position);
  });

  it('allows Hide hider movement, auto-disguises after idle, and switches props without cooldown', () => {
    const engine = createEngine();
    engine.debugForceNextPhase();

    engine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    engine.tick(500);

    let hider = getPlayer(engine, 'p2');
    assert.equal(hider.role, PlayerRole.Hider);
    assert.equal(hider.state, PlayerState.HiderMovingAsCharacter);
    assert.equal(hider.position.x, 180);

    engine.clearMovementInput('p2');
    engine.tick(249);
    assert.equal(getPlayer(engine, 'p2').state, PlayerState.HiderMovingAsCharacter);

    engine.tick(1);
    hider = getPlayer(engine, 'p2');
    assert.equal(hider.state, PlayerState.HiderDisguisedIdle);

    assert.equal(hider.currentPropId, 'wooden_crate');
    assert.equal(engine.switchDisguise('p2'), true);
    assert.equal(engine.switchDisguise('p2'), true);
    assert.equal(getPlayer(engine, 'p2').currentPropId, 'plant_pot');
  });

  it('lets Seek attacks destroy multiple props and capture hiders in the sector', () => {
    const engine = createEngine();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();

    const before = engine.getSnapshot();
    assert.equal(before.phase, RoundPhase.Seek);
    assert.equal(before.attackCountRemaining, 4);

    const attack = engine.attack('p1');
    assert.equal(attack.accepted, true);
    assert.equal(attack.endedRound, true);
    assert.deepEqual([...attack.destroyedPropIds].sort(), ['bucket_01', 'crate_01']);
    assert.deepEqual(attack.capturedPlayerIds.sort(), ['p2', 'p3']);

    const after = engine.getSnapshot();
    assert.equal(after.phase, RoundPhase.Result);
    assert.equal(getPlayer(engine, 'p2').state, PlayerState.Captured);
    assert.equal(after.lastRoundResult?.endedReason, 'all_hiders_captured');
    assert.deepEqual(after.lastRoundResult?.scoreDeltas.map((delta) => delta.reason), [
      'seeker_capture',
      'seeker_capture',
      'seeker_all_caught_bonus'
    ]);
    assert.equal(getPlayer(engine, 'p1').score, 3);
  });

  it('ends the round and scores survivors when attack count reaches zero', () => {
    const engine = createEngine({
      gameConfig: {
        ...TEST_CONFIG,
        attackRadiusPx: 10,
        attackCountMultiplier: 1
      }
    });
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();

    assert.equal(engine.attack('p1').endedRound, false);
    const secondAttack = engine.attack('p1');
    assert.equal(secondAttack.endedRound, true);

    const snapshot = engine.getSnapshot();
    assert.equal(snapshot.phase, RoundPhase.Result);
    assert.equal(snapshot.lastRoundResult?.endedReason, 'attacks_depleted');
    assert.deepEqual(snapshot.lastRoundResult?.survivingHiderIds.sort(), ['p2', 'p3']);
    assert.equal(getPlayer(engine, 'p2').score, 1);
    assert.equal(getPlayer(engine, 'p3').score, 1);
    assert.equal(getPlayer(engine, 'p1').score, 0);
  });

  it('rotates the seeker on the next round and ends after each player has searched once', () => {
    const engine = createEngine();

    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    let snapshot = engine.debugForceNextPhase();

    assert.equal(snapshot.phase, RoundPhase.Preview);
    assert.equal(snapshot.roundIndex, 1);
    assert.equal(getPlayer(engine, 'p2').role, PlayerRole.Seeker);

    for (let i = 0; i < 8; i += 1) {
      snapshot = engine.debugForceNextPhase();
    }

    assert.equal(snapshot.phase, RoundPhase.MatchEnd);
    assert.equal(snapshot.matchEnded, true);
  });
});

function createEngine(overrides: Partial<LocalGameSetup> = {}): LocalGameEngine {
  return new LocalGameEngine({
    gameConfig: TEST_CONFIG,
    players: [
      {
        playerId: 'p1',
        displayName: 'Seeker',
        startPosition: { x: 0, y: 0 },
        startFacing: { x: 1, y: 0 }
      },
      {
        playerId: 'p2',
        displayName: 'Hider A',
        startPosition: { x: 80, y: 0 },
        initialPropId: 'wooden_crate'
      },
      {
        playerId: 'p3',
        displayName: 'Hider B',
        startPosition: { x: 100, y: 20 },
        initialPropId: 'bucket_blue'
      }
    ],
    availablePropIds: ['wooden_crate', 'bucket_blue', 'plant_pot'],
    props: [
      {
        instanceId: 'crate_01',
        propId: 'wooden_crate',
        position: { x: 70, y: 0 },
        radius: 20,
        breakable: true,
        destroyed: false
      },
      {
        instanceId: 'bucket_01',
        propId: 'bucket_blue',
        position: { x: 95, y: -25 },
        radius: 20,
        breakable: true,
        destroyed: false
      },
      {
        instanceId: 'plant_safe',
        propId: 'plant_pot',
        position: { x: -120, y: 0 },
        radius: 20,
        breakable: true,
        destroyed: false
      }
    ],
    hideIdleDisguiseMs: 250,
    ...overrides
  });
}

function getPlayer(engine: LocalGameEngine, playerId: string) {
  const player = engine.getSnapshot().players.find((candidate) => candidate.playerId === playerId);
  assert.ok(player, `Expected player ${playerId} to exist.`);
  return player;
}
