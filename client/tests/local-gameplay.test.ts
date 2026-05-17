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

  it('uses the same two-to-four player count as online rooms', () => {
    assert.throws(
      () =>
        createEngine({
          players: [
            { playerId: 'p1', displayName: 'P1' },
            { playerId: 'p2', displayName: 'P2' },
            { playerId: 'p3', displayName: 'P3' },
            { playerId: 'p4', displayName: 'P4' },
            { playerId: 'p5', displayName: 'P5' }
          ]
        }),
      /Local match requires 2 to 4 players/
    );
  });

  it('allows Hide hider movement, auto-disguises after idle, and switches props without cooldown', () => {
    const engine = createEngine();
    engine.debugForceNextPhase();

    engine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    engine.tick(500);

    let hider = getPlayer(engine, 'p2');
    assert.equal(hider.role, PlayerRole.Hider);
    assert.equal(hider.state, PlayerState.HiderMovingAsCharacter);
    assert.ok(Math.abs(hider.position.x - 180) < 0.001);

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

  it('blocks local movement against props, solid obstacles, and hidden hiders', () => {
    const obstacleEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      props: [],
      obstacles: [
        {
          id: 'solid_counter',
          position: { x: 115, y: 0 },
          size: { width: 40, height: 80 },
          blocksMovement: true,
          allowsOverlap: false
        }
      ]
    });
    obstacleEngine.debugForceNextPhase();
    obstacleEngine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    obstacleEngine.tick(1000);
    assert.ok(getPlayer(obstacleEngine, 'p2').position.x < 115);

    const thinObstacleEngine = createEngine({
      gameConfig: {
        ...TEST_CONFIG,
        hiderHideSpeed: 1000
      },
      mapSize: { width: 300, height: 200 },
      props: [],
      obstacles: [
        {
          id: 'thin_wall',
          position: { x: 128, y: -50 },
          size: { width: 12, height: 100 },
          blocksMovement: true,
          allowsOverlap: false
        }
      ]
    });
    thinObstacleEngine.debugForceNextPhase();
    thinObstacleEngine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    thinObstacleEngine.tick(1000);
    assert.ok(getPlayer(thinObstacleEngine, 'p2').position.x <= 116.001);

    const destroyedPropEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      props: [
        {
          instanceId: 'broken_crate',
          propId: 'wooden_crate',
          position: { x: 120, y: 0 },
          radius: 20,
          breakable: true,
          destroyed: true
        }
      ]
    });
    destroyedPropEngine.debugForceNextPhase();
    destroyedPropEngine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    destroyedPropEngine.tick(300);
    assert.ok(getPlayer(destroyedPropEngine, 'p2').position.x > 120);

    const nonBlockingPropEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      props: [
        {
          instanceId: 'floor_mat',
          propId: 'floor_mat',
          position: { x: 120, y: 0 },
          radius: 30,
          breakable: false,
          destroyed: false,
          blocksMovement: false
        }
      ]
    });
    nonBlockingPropEngine.debugForceNextPhase();
    nonBlockingPropEngine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    nonBlockingPropEngine.tick(300);
    assert.ok(getPlayer(nonBlockingPropEngine, 'p2').position.x > 120);

    const nonBlockingFloorVolumeEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      props: [],
      obstacles: [
        {
          id: 'floor_decoration',
          position: { x: 72, y: 40 },
          size: { width: 90, height: 44 },
          blocksMovement: false,
          allowsOverlap: true
        }
      ]
    });
    nonBlockingFloorVolumeEngine.debugForceNextPhase();
    nonBlockingFloorVolumeEngine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    nonBlockingFloorVolumeEngine.tick(400);
    assert.ok(getPlayer(nonBlockingFloorVolumeEngine, 'p2').position.x > 120);

    const attackedPropEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          startPosition: { x: 220, y: 60 },
          initialPropId: 'wooden_crate'
        }
      ],
      props: [
        {
          instanceId: 'crate_to_break',
          propId: 'wooden_crate',
          position: { x: 70, y: 60 },
          radius: 20,
          breakable: true,
          destroyed: false
        }
      ]
    });
    attackedPropEngine.debugForceNextPhase();
    attackedPropEngine.debugForceNextPhase();
    assert.deepEqual(attackedPropEngine.attack('p1').destroyedPropIds, ['crate_to_break']);
    attackedPropEngine.setMovementInput({ playerId: 'p1', direction: { x: 1, y: 0 } });
    attackedPropEngine.tick(500);
    assert.ok(getPlayer(attackedPropEngine, 'p1').position.x > 70);

    const overlappedObstacleEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          startPosition: { x: 80, y: 60 },
          initialPropId: 'wooden_crate'
        }
      ],
      props: [],
      obstacles: [
        {
          id: 'spawn_overlap_counter',
          position: { x: 60, y: 40 },
          size: { width: 80, height: 40 },
          blocksMovement: true,
          allowsOverlap: false
        }
      ]
    });
    overlappedObstacleEngine.debugForceNextPhase();
    overlappedObstacleEngine.setMovementInput({ playerId: 'p2', direction: { x: 1, y: 0 } });
    overlappedObstacleEngine.tick(100);
    assert.ok(getPlayer(overlappedObstacleEngine, 'p2').position.x <= 80.001);
    overlappedObstacleEngine.setMovementInput({ playerId: 'p2', direction: { x: 0, y: -1 } });
    overlappedObstacleEngine.tick(200);
    assert.ok(getPlayer(overlappedObstacleEngine, 'p2').position.y < 50);

    const hiddenHiderEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      props: [],
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          startPosition: { x: 80, y: 60 },
          initialPropId: 'wooden_crate'
        }
      ]
    });
    hiddenHiderEngine.debugForceNextPhase();
    hiddenHiderEngine.debugForceNextPhase();
    hiddenHiderEngine.setMovementInput({ playerId: 'p1', direction: { x: 1, y: 0 } });
    hiddenHiderEngine.tick(400);
    assert.ok(getPlayer(hiddenHiderEngine, 'p1').position.x <= 55);

    const hideBodyEngine = createEngine({
      mapSize: { width: 300, height: 200 },
      props: [],
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 240, y: 60 },
          startFacing: { x: -1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Idle Hider',
          startPosition: { x: 80, y: 60 },
          initialPropId: 'wooden_crate'
        },
        {
          playerId: 'p3',
          displayName: 'Moving Hider',
          startPosition: { x: 20, y: 60 },
          initialPropId: 'plant_pot'
        }
      ]
    });
    hideBodyEngine.debugForceNextPhase();
    hideBodyEngine.setMovementInput({ playerId: 'p3', direction: { x: 1, y: 0 } });
    hideBodyEngine.tick(600);
    assert.ok(getPlayer(hideBodyEngine, 'p3').position.x <= 58);

    const capturedHiderEngine = createEngine({
      mapSize: { width: 320, height: 200 },
      props: [],
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Captured Hider',
          startPosition: { x: 80, y: 60 },
          initialPropId: 'wooden_crate'
        },
        {
          playerId: 'p3',
          displayName: 'Surviving Hider',
          startPosition: { x: 250, y: 160 },
          initialPropId: 'bucket_blue'
        }
      ]
    });
    capturedHiderEngine.debugForceNextPhase();
    capturedHiderEngine.debugForceNextPhase();
    assert.deepEqual(capturedHiderEngine.attack('p1').capturedPlayerIds, ['p2']);
    capturedHiderEngine.setMovementInput({ playerId: 'p1', direction: { x: 1, y: 0 } });
    capturedHiderEngine.tick(500);
    assert.ok(getPlayer(capturedHiderEngine, 'p1').position.x > 80);

    const capturedHiderWithPropEngine = createEngine({
      mapSize: { width: 320, height: 200 },
      props: [
        {
          instanceId: 'still_solid_crate',
          propId: 'wooden_crate',
          position: { x: 180, y: 60 },
          radius: 24,
          breakable: true,
          destroyed: false
        }
      ],
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Captured Hider',
          startPosition: { x: 80, y: 60 },
          initialPropId: 'wooden_crate'
        },
        {
          playerId: 'p3',
          displayName: 'Surviving Hider',
          startPosition: { x: 280, y: 160 },
          initialPropId: 'bucket_blue'
        }
      ]
    });
    capturedHiderWithPropEngine.debugForceNextPhase();
    capturedHiderWithPropEngine.debugForceNextPhase();
    assert.deepEqual(capturedHiderWithPropEngine.attack('p1').capturedPlayerIds, ['p2']);
    capturedHiderWithPropEngine.setMovementInput({ playerId: 'p1', direction: { x: 1, y: 0 } });
    capturedHiderWithPropEngine.tick(1000);
    assert.ok(getPlayer(capturedHiderWithPropEngine, 'p1').position.x > 80);
    assert.ok(getPlayer(capturedHiderWithPropEngine, 'p1').position.x < 160);
  });

  it('keeps facing responsive but stops movement state when input is blocked by a wall', () => {
    const engine = createEngine({
      mapSize: { width: 300, height: 200 },
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 250, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          startPosition: { x: 12, y: 60 },
          startFacing: { x: 1, y: 0 },
          initialPropId: 'wooden_crate'
        }
      ],
      props: [
        {
          instanceId: 'radius_reference',
          propId: 'wooden_crate',
          position: { x: 260, y: 60 },
          radius: 20,
          breakable: true,
          destroyed: true
        }
      ]
    });
    engine.debugForceNextPhase();

    engine.setMovementInput({ playerId: 'p2', direction: { x: -1, y: 0 } });
    engine.tick(300);

    const hider = getPlayer(engine, 'p2');
    assert.equal(hider.facing.x, -1);
    assert.equal(hider.facing.y, 0);
    assert.equal(hider.state, PlayerState.HiderDisguisedIdle);
    assert.equal(hider.position.x, 12);
  });

  it('clamps local movement to configured inner map bounds', () => {
    const engine = createEngine({
      gameConfig: {
        ...TEST_CONFIG,
        previewDurationMs: 1,
        hideDurationMs: 1,
        seekerSpeed: 200
      },
      mapSize: { width: 300, height: 200 },
      movementBounds: { minX: 40, minY: 30, maxX: 260, maxY: 170 },
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 248, y: 100 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider',
          startPosition: { x: 100, y: 100 },
          initialPropId: 'wooden_crate'
        }
      ],
      props: []
    });
    engine.tick(1);
    engine.tick(1);
    engine.setMovementInput({ playerId: 'p1', direction: { x: 1, y: 0 } });
    engine.tick(500);

    assert.ok(getPlayer(engine, 'p1').position.x <= 248.001);
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
    const engine = createEngine({
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
      ]
    });
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
    assert.equal(after.lastRoundResult?.endedReason, 'all_captured');
    assert.deepEqual(after.lastRoundResult?.scoreDeltas.map((delta) => delta.reason), [
      'seeker_capture',
      'seeker_capture',
      'seeker_all_caught_bonus'
    ]);
    assert.equal(getPlayer(engine, 'p1').score, 3);
  });

  it('hits breakable props when their circle overlaps the front cone edge', () => {
    const engine = createEngine({
      mapSize: { width: 240, height: 220 },
      gameConfig: {
        ...TEST_CONFIG,
        attackRadiusPx: 90
      },
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          startPosition: { x: 210, y: 60 },
          initialPropId: 'wooden_crate'
        }
      ],
      props: [
        {
          instanceId: 'edge_crate',
          propId: 'wooden_crate',
          position: { x: 95, y: 150 },
          radius: 28,
          breakable: true,
          destroyed: false
        }
      ]
    });
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();

    const attack = engine.attack('p1');

    assert.equal(attack.accepted, true);
    assert.deepEqual(attack.destroyedPropIds, ['edge_crate']);
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
    assert.equal(snapshot.lastRoundResult?.endedReason, 'attacks_used');
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

  it('resets mapped local rounds to clean spawns and props when seeker rotates', () => {
    const engine = createEngine({
      mapSize: { width: 260, height: 160 },
      seekerSpawnPoint: { x: 20, y: 60 },
      spawnPoints: [
        { x: 180, y: 60 },
        { x: 180, y: 110 }
      ],
      players: [
        {
          playerId: 'p1',
          displayName: 'Seeker',
          startPosition: { x: 20, y: 60 },
          startFacing: { x: 1, y: 0 }
        },
        {
          playerId: 'p2',
          displayName: 'Hider A',
          startPosition: { x: 180, y: 60 },
          initialPropId: 'wooden_crate'
        },
        {
          playerId: 'p3',
          displayName: 'Hider B',
          startPosition: { x: 180, y: 110 },
          initialPropId: 'bucket_blue'
        }
      ],
      props: [
        {
          instanceId: 'crate_01',
          propId: 'wooden_crate',
          position: { x: 70, y: 60 },
          radius: 20,
          breakable: true,
          destroyed: false
        }
      ]
    });

    engine.debugForceNextPhase();
    engine.debugForceNextPhase();
    assert.deepEqual(engine.attack('p1').destroyedPropIds, ['crate_01']);
    assert.equal(engine.getSnapshot().props[0]?.destroyed, true);

    engine.debugForceNextPhase();
    const nextPreview = engine.debugForceNextPhase();

    assert.equal(nextPreview.phase, RoundPhase.Preview);
    assert.equal(nextPreview.roundIndex, 1);
    assert.equal(nextPreview.props[0]?.destroyed, false);
    assert.deepEqual(getPlayer(engine, 'p2').position, { x: 20, y: 60 });
    assert.deepEqual(getPlayer(engine, 'p1').position, { x: 180, y: 60 });
    assert.deepEqual(getPlayer(engine, 'p3').position, { x: 180, y: 110 });
  });

  it('supports solo match with three computer players for a four-round match', () => {
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
        { playerId: 'computer_3', displayName: 'Computer 3', startPosition: { x: -80, y: 0 } }
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

    assert.deepEqual(seekerIds, ['solo_player_1', 'computer_1', 'computer_2', 'computer_3']);
    assert.equal(snapshot.roundIndex, 4);
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
    assert.equal(snapshot.lastRoundResult?.endedReason, 'all_captured');
  });

  it('retargets a solo computer seeker after repeated blocked movement', () => {
    const engine = createEngine({
      gameConfig: {
        ...TEST_CONFIG,
        seekDurationMs: 8000,
        seekerSpeed: 140
      },
      players: [
        {
          playerId: 'human',
          displayName: 'Human',
          startPosition: { x: 600, y: 600 },
          initialPropId: 'wooden_crate'
        },
        {
          playerId: 'computer',
          displayName: 'Computer',
          startPosition: { x: 0, y: 0 },
          startFacing: { x: 1, y: 0 }
        }
      ],
      props: [
        {
          instanceId: 'blocked_target',
          propId: 'wooden_crate',
          position: { x: 120, y: 0 },
          radius: 20,
          breakable: true,
          destroyed: false,
          blocksMovement: true
        },
        {
          instanceId: 'open_target',
          propId: 'wooden_crate',
          position: { x: 0, y: 130 },
          radius: 20,
          breakable: true,
          destroyed: false,
          blocksMovement: true
        }
      ],
      obstacles: [
        {
          id: 'blocking_counter',
          position: { x: 34, y: -30 },
          size: { width: 52, height: 60 },
          blocksMovement: true,
          allowsOverlap: false
        }
      ],
      mapSize: { width: 720, height: 720 }
    });
    const computerSeeker = new SoloComputerSeekerController({
      humanPlayerId: 'human',
      attackIntervalMs: 9999,
      suspiciousMovementRangePx: 0
    });

    let snapshot = engine.getSnapshot();
    while (!(snapshot.roundIndex === 1 && snapshot.phase === RoundPhase.Seek)) {
      snapshot = engine.debugForceNextPhase();
    }

    const seekerStart = getPlayer(engine, 'computer').position;
    let maxStuckTicks = 0;
    let currentStuckTicks = 0;
    let previousPosition = seekerStart;
    for (let tick = 0; tick < 32; tick += 1) {
      computerSeeker.update(engine, snapshot, 120);
      snapshot = engine.tick(120);
      const currentPosition = getPlayer(engine, 'computer').position;
      const movedDistance = Math.hypot(currentPosition.x - previousPosition.x, currentPosition.y - previousPosition.y);
      currentStuckTicks = movedDistance <= 0.01 ? currentStuckTicks + 1 : 0;
      maxStuckTicks = Math.max(maxStuckTicks, currentStuckTicks);
      previousPosition = currentPosition;
    }

    const seeker = getPlayer(engine, 'computer');
    assert.ok(seeker.position.y > seekerStart.y + 16, `expected seeker to recover toward the open target; y=${seeker.position.y}`);
    assert.ok(maxStuckTicks < 10, `expected stuck recovery before long freeze; maxStuckTicks=${maxStuckTicks}`);
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
        startPosition: { x: 220, y: 80 },
        initialPropId: 'bucket_blue'
      }
    ],
    availablePropIds: ['wooden_crate', 'bucket_blue', 'plant_pot'],
    props: [
      {
        instanceId: 'crate_01',
        propId: 'wooden_crate',
        position: { x: 40, y: 0 },
        radius: 20,
        breakable: true,
        destroyed: false
      },
      {
        instanceId: 'bucket_01',
        propId: 'bucket_blue',
        position: { x: 95, y: -45 },
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
