import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LocalGameEngine } from '../assets/scripts/gameplay/LocalGameEngine';
import { SoloComputerSeekerController } from '../assets/scripts/gameplay/SoloComputerSeekerController';
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

  it('rejects hider disguise switching during Preview', () => {
    const engine = createEngine();
    const before = getPlayer(engine, 'p2').currentPropId;

    assert.equal(engine.getSnapshot().phase, RoundPhase.Preview);
    assert.equal(engine.switchDisguise('p2'), false);
    assert.equal(getPlayer(engine, 'p2').currentPropId, before);
  });

  it('rejects hider disguise switching during Result', () => {
    const engine = createEngine();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    const before = getPlayer(engine, 'p2').currentPropId;

    assert.equal(engine.getSnapshot().phase, RoundPhase.Result);
    assert.equal(engine.switchDisguise('p2'), false);
    assert.equal(getPlayer(engine, 'p2').currentPropId, before);
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

  it('supports solo practice with four computer players for a five-round match', () => {
    const engine = createEngine({
      players: [
        {
          playerId: 'solo_player_1',
          displayName: 'Human',
          startPosition: { x: 0, y: 0 },
          startFacing: { x: 1, y: 0 }
        },
        { playerId: 'computer_1', displayName: 'Computer 1', startPosition: { x: 80, y: 0 } },
        { playerId: 'computer_2', displayName: 'Computer 2', startPosition: { x: 100, y: 20 } },
        { playerId: 'computer_3', displayName: 'Computer 3', startPosition: { x: -80, y: 0 } },
        { playerId: 'computer_4', displayName: 'Computer 4', startPosition: { x: -100, y: 20 } }
      ]
    });

    const seekerIds: string[] = [];
    let snapshot = engine.getSnapshot();
    seekerIds.push(snapshot.players[snapshot.seekerIndex]?.playerId ?? '');

    while (!snapshot.matchEnded) {
      snapshot = engine.debugForceNextPhase();
      if (snapshot.phase === RoundPhase.Preview && !snapshot.matchEnded) {
        seekerIds.push(snapshot.players[snapshot.seekerIndex]?.playerId ?? '');
      }
    }

    assert.deepEqual(seekerIds, ['solo_player_1', 'computer_1', 'computer_2', 'computer_3', 'computer_4']);
    assert.equal(snapshot.roundIndex, 5);
    assert.equal(snapshot.matchEnded, true);
  });

  it('lets a solo computer seeker chase moving hiders and use normal cone attacks', () => {
    const engine = createEngine({
      players: [
        {
          playerId: 'human',
          displayName: 'Human',
          startPosition: { x: 80, y: 0 },
          initialPropId: 'wooden_crate'
        },
        {
          playerId: 'computer',
          displayName: 'Computer',
          startPosition: { x: 0, y: 0 },
          startFacing: { x: 1, y: 0 }
        }
      ],
      props: []
    });
    const computerSeeker = new SoloComputerSeekerController({
      humanPlayerId: 'human',
      attackIntervalMs: 0,
      attackDistancePx: 120
    });

    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    engine.setMovementInput({ playerId: 'human', direction: { x: 1, y: 0 } });
    let snapshot = engine.tick(100);

    assert.equal(snapshot.phase, RoundPhase.Seek);
    assert.equal(getPlayer(engine, 'computer').role, PlayerRole.Seeker);

    const eventText = computerSeeker.update(engine, snapshot, 100);
    snapshot = engine.getSnapshot();

    assert.match(eventText ?? '', /Computer attacked/);
    assert.equal(getPlayer(engine, 'human').captured, true);
    assert.equal(snapshot.phase, RoundPhase.Result);
    assert.equal(snapshot.lastRoundResult?.endedReason, 'all_hiders_captured');
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
