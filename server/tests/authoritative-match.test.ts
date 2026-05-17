import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthoritativeMatch,
  PlayerRole,
  PlayerState,
  RoundPhase,
  redactSnapshotForPlayer,
  type GameConfig,
  type ServerMapFixture,
} from '../src/game/index.js';

const TEST_FIXTURE: ServerMapFixture = {
  mapId: 'kitchen_01',
  width: 200,
  height: 120,
  seekerSpawn: { x: 20, y: 60 },
  seekerFacing: { x: 1, y: 0 },
  hiderSpawns: [
    { x: 100, y: 60 },
    { x: 100, y: 100 },
    { x: 180, y: 60 },
  ],
  propPool: ['wooden_crate', 'water_bucket', 'chair'],
  propRadiusById: {
    wooden_crate: 10,
    water_bucket: 10,
    chair: 10,
  },
  props: [
    {
      propInstanceId: 'crate_near',
      propConfigId: 'wooden_crate',
      position: { x: 70, y: 60 },
      radius: 10,
      breakable: true,
      destroyed: false,
    },
    {
      propInstanceId: 'bucket_near',
      propConfigId: 'water_bucket',
      position: { x: 80, y: 75 },
      radius: 10,
      breakable: true,
      destroyed: false,
    },
    {
      propInstanceId: 'chair_outside',
      propConfigId: 'chair',
      position: { x: 20, y: 110 },
      radius: 10,
      breakable: true,
      destroyed: false,
    },
  ],
};

const BASE_TEST_CONFIG: Partial<GameConfig> = {
  previewDurationMs: 1000,
  hideDurationMs: 1000,
  seekDurationMs: 1000,
  resultDurationMs: 1000,
  attackSectorDeg: 90,
  attackRadiusPx: 80,
  attackCountMultiplier: 2,
  hiderHideSpeed: 100,
  hiderSeekSpeed: 50,
  seekerSpeed: 100,
};

test('server match phases gate movement by role and phase', () => {
  const match = createMatch(['p1', 'p2'], BASE_TEST_CONFIG);

  match.handleInput('p1', { moveX: 1, moveY: 0 });
  match.handleInput('p2', { moveX: 1, moveY: 0 });
  match.tick(100);

  let snapshot = match.getSnapshot();
  assert.equal(snapshot.phase, RoundPhase.Preview);
  assert.deepEqual(snapshot.players.map((player) => player.state), [
    PlayerState.InvisibleInPreview,
    PlayerState.InvisibleInPreview,
  ]);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p1')?.position.x, 20);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.position.x, 100);

  match.tick(900);
  assert.equal(match.getSnapshot().phase, RoundPhase.Hide);

  match.handleInput('p1', { moveX: 1, moveY: 0 });
  match.handleInput('p2', { moveX: 1, moveY: 0 });
  match.tick(100);

  snapshot = match.getSnapshot();
  assert.equal(snapshot.players.find((player) => player.playerId === 'p1')?.position.x, 20);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.position.x, 110);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p1')?.state, PlayerState.SeekerLocked);

  match.handleInput('p2', { moveX: 0, moveY: 0 });
  match.tick(900);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);

  match.handleInput('p1', { moveX: 1, moveY: 0 });
  match.handleInput('p2', { moveX: 1, moveY: 0 });
  match.tick(100);

  snapshot = match.getSnapshot();
  assert.equal(snapshot.players.find((player) => player.playerId === 'p1')?.position.x, 30);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.position.x, 115);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.state, PlayerState.HiderDisguisedMoving);
});

test('server movement is blocked by solid props, obstacles, and hidden hiders', () => {
  const propFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 140,
    hiderSpawns: [{ x: 180, y: 100 }],
    props: [
      {
        propInstanceId: 'solid_crate',
        propConfigId: 'wooden_crate',
        position: { x: 70, y: 60 },
        radius: 10,
        breakable: true,
        destroyed: false,
      },
    ],
    obstacles: [],
  };
  const propMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    attackRadiusPx: 100,
  }, propFixture);
  propMatch.tick(1);
  propMatch.tick(1);
  propMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  propMatch.tick(500);
  assert.ok((propMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 55);
  const solidCrateState = propMatch.getSnapshot().props.find((prop) => prop.propInstanceId === 'solid_crate');
  assert.equal(solidCrateState?.radius, 10);
  assert.equal(solidCrateState?.isBreakable, true);
  assert.equal(solidCrateState?.blocksMovement, true);

  propMatch.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(propMatch.getSnapshot().props.find((prop) => prop.propInstanceId === 'solid_crate')?.isDestroyed, true);
  propMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  propMatch.tick(500);
  assert.ok((propMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) > 70);

  const nonBlockingPropFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 140,
    hiderSpawns: [{ x: 180, y: 100 }],
    props: [
      {
        propInstanceId: 'floor_mat',
        propConfigId: 'floor_mat',
        position: { x: 70, y: 60 },
        radius: 18,
        breakable: false,
        blocksMovement: false,
        destroyed: false,
      },
    ],
    obstacles: [],
  };
  const nonBlockingPropMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, nonBlockingPropFixture);
  nonBlockingPropMatch.tick(1);
  nonBlockingPropMatch.tick(1);
  nonBlockingPropMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  nonBlockingPropMatch.tick(600);
  assert.ok((nonBlockingPropMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) > 70);

  const obstacleFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 140,
    hiderSpawns: [{ x: 180, y: 100 }],
    props: [],
    obstacles: [
      {
        obstacleId: 'solid_counter',
        position: { x: 55, y: 40 },
        size: { width: 20, height: 40 },
        blocksMovement: true,
        allowsOverlap: false,
      },
    ],
  };
  const obstacleMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, obstacleFixture);
  obstacleMatch.tick(1);
  obstacleMatch.tick(1);
  obstacleMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  obstacleMatch.tick(500);
  assert.ok((obstacleMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 55);

  const thinObstacleFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 140,
    seekerSpawn: { x: 20, y: 60 },
    hiderSpawns: [{ x: 180, y: 100 }],
    props: [],
    obstacles: [
      {
        obstacleId: 'thin_wall',
        position: { x: 75, y: 40 },
        size: { width: 12, height: 40 },
        blocksMovement: true,
        allowsOverlap: false,
      },
    ],
  };
  const thinObstacleMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    seekerSpeed: 1000,
  }, thinObstacleFixture);
  thinObstacleMatch.tick(1);
  thinObstacleMatch.tick(1);
  thinObstacleMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  thinObstacleMatch.tick(500);
  assert.ok((thinObstacleMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 63.001);

  const overlappedObstacleFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 140,
    seekerSpawn: { x: 20, y: 60 },
    hiderSpawns: [{ x: 180, y: 100 }],
    props: [],
    obstacles: [
      {
        obstacleId: 'spawn_overlap_counter',
        position: { x: 0, y: 40 },
        size: { width: 60, height: 40 },
        blocksMovement: true,
        allowsOverlap: false,
      },
    ],
  };
  const overlappedObstacleMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, overlappedObstacleFixture);
  overlappedObstacleMatch.tick(1);
  overlappedObstacleMatch.tick(1);
  overlappedObstacleMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  overlappedObstacleMatch.tick(100);
  assert.ok((overlappedObstacleMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 20.001);
  overlappedObstacleMatch.handleInput('p1', { moveX: 0, moveY: -1 });
  overlappedObstacleMatch.tick(200);
  assert.ok((overlappedObstacleMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.y ?? 0) < 50);

  const hiderFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 140,
    hiderSpawns: [{ x: 80, y: 60 }],
    props: [],
    obstacles: [],
  };
  const hiderMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, hiderFixture);
  hiderMatch.tick(1);
  hiderMatch.tick(1);
  hiderMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  hiderMatch.tick(600);
  assert.ok((hiderMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 62);

  const hideBodyFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 260,
    height: 140,
    seekerSpawn: { x: 230, y: 60 },
    hiderSpawns: [{ x: 80, y: 60 }, { x: 20, y: 60 }],
    props: [],
    obstacles: [],
  };
  const hideBodyMatch = createMatchWithFixture(['p1', 'p2', 'p3'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
  }, hideBodyFixture);
  hideBodyMatch.tick(1);
  assert.equal(hideBodyMatch.getSnapshot().phase, RoundPhase.Hide);
  hideBodyMatch.handleInput('p3', { moveX: 1, moveY: 0 });
  hideBodyMatch.tick(600);
  assert.ok((hideBodyMatch.getSnapshot().players.find((player) => player.playerId === 'p3')?.position.x ?? 0) <= 62);

  const capturedHiderFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 320,
    height: 180,
    hiderSpawns: [{ x: 80, y: 60 }, { x: 250, y: 140 }],
    props: [],
    obstacles: [],
  };
  const capturedHiderMatch = createMatchWithFixture(['p1', 'p2', 'p3'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, capturedHiderFixture);
  capturedHiderMatch.tick(1);
  capturedHiderMatch.tick(1);
  capturedHiderMatch.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(capturedHiderMatch.getSnapshot().players.find((player) => player.playerId === 'p2')?.captured, true);
  capturedHiderMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  capturedHiderMatch.tick(800);
  assert.ok((capturedHiderMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) > 80);

  const capturedHiderWithPropFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 320,
    height: 180,
    hiderSpawns: [{ x: 80, y: 60 }, { x: 280, y: 140 }],
    props: [
      {
        propInstanceId: 'still_solid_crate',
        propConfigId: 'wooden_crate',
        position: { x: 180, y: 60 },
        radius: 24,
        breakable: true,
        destroyed: false,
      },
    ],
    obstacles: [],
  };
  const capturedHiderWithPropMatch = createMatchWithFixture(['p1', 'p2', 'p3'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, capturedHiderWithPropFixture);
  capturedHiderWithPropMatch.tick(1);
  capturedHiderWithPropMatch.tick(1);
  capturedHiderWithPropMatch.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(capturedHiderWithPropMatch.getSnapshot().players.find((player) => player.playerId === 'p2')?.captured, true);
  capturedHiderWithPropMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  capturedHiderWithPropMatch.tick(1000);
  const seekerAfterCapturedAndProp = capturedHiderWithPropMatch.getSnapshot().players.find((player) => player.playerId === 'p1');
  assert.ok((seekerAfterCapturedAndProp?.position.x ?? 0) > 80);
  assert.ok((seekerAfterCapturedAndProp?.position.x ?? 0) < 160);

  const edgeFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 120,
    height: 120,
    seekerSpawn: { x: 12, y: 60 },
    hiderSpawns: [{ x: 90, y: 60 }],
    props: [],
    obstacles: [],
  };
  const edgeMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  }, edgeFixture);
  edgeMatch.tick(1);
  edgeMatch.tick(1);
  edgeMatch.handleInput('p1', { moveX: -1, moveY: 0 });
  edgeMatch.tick(300);
  const edgeSeeker = edgeMatch.getSnapshot().players.find((player) => player.playerId === 'p1');
  assert.ok((edgeSeeker?.position.x ?? 0) >= 12);
  assert.equal(edgeSeeker?.facing?.x, -1);
  assert.equal(edgeSeeker?.facing?.y, 0);

  const boundedFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 240,
    height: 160,
    movementBounds: { minX: 40, minY: 30, maxX: 180, maxY: 120 },
    seekerSpawn: { x: 168, y: 80 },
    hiderSpawns: [{ x: 90, y: 80 }],
    props: [],
    obstacles: [],
  };
  const boundedMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    seekerSpeed: 200,
  }, boundedFixture);
  boundedMatch.tick(1);
  boundedMatch.tick(1);
  boundedMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  boundedMatch.tick(500);
  assert.ok((boundedMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 168.001);

  const standingFixture: ServerMapFixture = {
    ...TEST_FIXTURE,
    width: 320,
    height: 280,
    seekerSpawn: { x: 96, y: 160 },
    hiderSpawns: [{ x: 250, y: 160 }],
    props: [],
    obstacles: [
      {
        obstacleId: 'obstacle_fridge',
        position: { x: 120, y: 130 },
        size: { width: 72, height: 100 },
        blocksMovement: true,
        allowsOverlap: false,
      },
    ],
  };
  const standingVisualMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    seekerSpeed: 220,
  }, standingFixture);
  standingVisualMatch.tick(1);
  standingVisualMatch.tick(1);
  standingVisualMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  standingVisualMatch.tick(700);
  assert.ok((standingVisualMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) > 190);

  const standingFootprintMatch = createMatchWithFixture(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    seekerSpeed: 220,
  }, {
    ...standingFixture,
    seekerSpawn: { x: 96, y: 216 },
  });
  standingFootprintMatch.tick(1);
  standingFootprintMatch.tick(1);
  standingFootprintMatch.handleInput('p1', { moveX: 1, moveY: 0 });
  standingFootprintMatch.tick(700);
  assert.ok((standingFootprintMatch.getSnapshot().players.find((player) => player.playerId === 'p1')?.position.x ?? 0) <= 122.001);
});

test('hider switch_prop cycles the server prop pool with no cooldown', () => {
  const match = createMatch(['p1', 'p2'], BASE_TEST_CONFIG);
  match.tick(1000);

  const initialProp = match.getSnapshot().players.find((player) => player.playerId === 'p2')?.currentPropId;
  assert.equal(initialProp, 'water_bucket');

  match.handleInput('p2', { moveX: 0, moveY: 0, action: 'switch_prop' });
  match.handleInput('p2', { moveX: 0, moveY: 0, action: 'switch_prop' });

  const switchedProp = match.getSnapshot().players.find((player) => player.playerId === 'p2')?.currentPropId;
  assert.equal(switchedProp, 'wooden_crate');
});

test('seeker attack destroys multiple props, captures hiders, and scores all-caught bonus', () => {
  const match = createMatch(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
  });
  match.tick(1);
  match.tick(1);

  match.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  const snapshot = match.getSnapshot(true);

  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.attackCountRemaining, 1);
  assert.equal(snapshot.scores.p1, 2);
  assert.equal(snapshot.scores.p2, 0);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.captured, true);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.state, PlayerState.Captured);
  assert.deepEqual(
    snapshot.props.filter((prop) => prop.isDestroyed).map((prop) => prop.propInstanceId).sort(),
    ['bucket_near', 'crate_near']
  );
  assert.ok(snapshot.events.some((event) => event.type === 'props_destroyed' && event.propIds.length === 2));
  assert.ok(snapshot.events.some((event) => event.type === 'hider_captured' && event.hiderId === 'p2'));
  assert.ok(snapshot.events.some((event) => event.type === 'round_ended' && event.reason === 'all_captured'));
  assert.ok(snapshot.events.every((event) => typeof event.id === 'string' && typeof event.serverTimeMs === 'number'));
});

test('seeker attack hits breakable props whose circle overlaps the cone edge', () => {
  const match = createMatchWithFixture(
    ['p1', 'p2'],
    {
      ...BASE_TEST_CONFIG,
      previewDurationMs: 1,
      hideDurationMs: 1,
      attackRadiusPx: 90,
    },
    {
      ...TEST_FIXTURE,
      width: 240,
      height: 220,
      hiderSpawns: [{ x: 210, y: 60 }],
      props: [
        {
          propInstanceId: 'edge_crate',
          propConfigId: 'wooden_crate',
          position: { x: 95, y: 150 },
          radius: 28,
          breakable: true,
          destroyed: false,
        },
      ],
    }
  );
  match.tick(1);
  match.tick(1);

  match.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  const snapshot = match.getSnapshot(true);

  assert.equal(snapshot.props.find((prop) => prop.propInstanceId === 'edge_crate')?.isDestroyed, true);
  assert.ok(snapshot.events.some((event) => event.type === 'props_destroyed' && event.propIds.includes('edge_crate')));
});

test('recipient snapshots redact player locations in Preview and hide state from seeker in Hide', () => {
  const match = createMatch(['p1', 'p2'], BASE_TEST_CONFIG);
  const previewSnapshot = match.getSnapshot();
  const previewForHider = redactSnapshotForPlayer(previewSnapshot, 'p2');

  assert.equal(previewForHider.phase, RoundPhase.Preview);
  assert.deepEqual(
    previewForHider.players.map((player) => player.position),
    [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  );
  assert.equal(previewForHider.players.find((player) => player.playerId === 'p2')?.currentPropId, undefined);
  assert.equal(previewForHider.props.length, TEST_FIXTURE.props.length);

  match.tick(1000);
  match.handleInput('p2', { moveX: 1, moveY: 0 });
  match.tick(100);
  const hideSnapshot = match.getSnapshot();
  const hideForSeeker = redactSnapshotForPlayer(hideSnapshot, 'p1');
  const hideForHider = redactSnapshotForPlayer(hideSnapshot, 'p2');

  assert.equal(hideForSeeker.phase, RoundPhase.Hide);
  assert.equal(hideForSeeker.props.length, 0);
  assert.deepEqual(
    hideForSeeker.players.map((player) => player.position),
    [{ x: 0, y: 0 }, { x: 0, y: 0 }]
  );
  assert.equal(hideForSeeker.players.find((player) => player.playerId === 'p2')?.currentPropId, undefined);
  assert.equal(hideForHider.props.length, TEST_FIXTURE.props.length);
  assert.equal(hideForHider.players.find((player) => player.playerId === 'p2')?.position.x, 110);
});

test('attacks used ends the round and awards surviving hiders', () => {
  const match = createMatch(['p1', 'p2', 'p3'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    attackRadiusPx: 5,
    attackCountMultiplier: 1,
  });
  match.tick(1);
  match.tick(1);

  match.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);
  assert.equal(match.getSnapshot().attackCountRemaining, 1);

  match.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  const snapshot = match.getSnapshot(true);

  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.attackCountRemaining, 0);
  assert.equal(snapshot.scores.p1, 0);
  assert.equal(snapshot.scores.p2, 1);
  assert.equal(snapshot.scores.p3, 1);
  assert.ok(snapshot.events.some((event) => event.type === 'round_ended' && event.reason === 'attacks_used'));
});

test('match ends after each player has been seeker once', () => {
  const match = createMatch(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    resultDurationMs: 1,
  });

  match.tick(1);
  match.tick(1);
  assert.equal(match.getSnapshot().seekerPlayerId, 'p1');
  match.handleInput('p1', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(match.getSnapshot().phase, RoundPhase.Result);

  match.tick(1);
  assert.equal(match.getSnapshot().phase, RoundPhase.Preview);
  assert.equal(match.getSnapshot().roundIndex, 1);

  match.tick(1);
  match.tick(1);
  assert.equal(match.getSnapshot().seekerPlayerId, 'p2');
  match.handleInput('p2', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(match.getSnapshot().phase, RoundPhase.Result);

  match.tick(1);
  const snapshot = match.getSnapshot();
  assert.equal(snapshot.phase, RoundPhase.MatchEnd);
  assert.equal(snapshot.matchEnded, true);
  assert.equal(snapshot.scores.p1, 2);
  assert.equal(snapshot.scores.p2, 2);
});

test('hider disconnect timeout captures hider without survival score', () => {
  const match = createMatch(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    seekDurationMs: 20000,
  });
  match.tick(1);
  match.tick(1);

  match.handlePlayerDisconnected('p2');
  let snapshot = match.tick(9999);
  assert.equal(snapshot.phase, RoundPhase.Seek);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.connected, false);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.captured, false);

  snapshot = match.tick(1);
  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.players.find((player) => player.playerId === 'p2')?.captured, true);
  assert.equal(snapshot.scores.p1, 2);
  assert.equal(snapshot.scores.p2, 0);
});

test('seeker disconnect timeout ends the current round early', () => {
  const match = createMatch(['p1', 'p2'], {
    ...BASE_TEST_CONFIG,
    previewDurationMs: 1,
    hideDurationMs: 1,
    seekDurationMs: 20000,
  });
  match.tick(1);
  match.tick(1);

  match.handlePlayerDisconnected('p1');
  const snapshot = match.tick(10000);

  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.scores.p1, 0);
  assert.equal(snapshot.scores.p2, 1);
  assert.ok(snapshot.events.some((event) => event.type === 'round_ended' && event.reason === 'seeker_disconnected'));
});

function createMatch(playerIds: string[], config: Partial<GameConfig>): AuthoritativeMatch {
  return createMatchWithFixture(playerIds, config, TEST_FIXTURE);
}

function createMatchWithFixture(
  playerIds: string[],
  config: Partial<GameConfig>,
  fixture: ServerMapFixture
): AuthoritativeMatch {
  return new AuthoritativeMatch({
    roomId: 'ROOM',
    players: playerIds.map((playerId) => ({
      playerId,
      displayName: playerId.toUpperCase(),
    })),
    config,
    fixture,
  });
}
