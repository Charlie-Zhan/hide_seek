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
  return new AuthoritativeMatch({
    roomId: 'ROOM',
    players: playerIds.map((playerId) => ({
      playerId,
      displayName: playerId.toUpperCase(),
    })),
    config,
    fixture: TEST_FIXTURE,
  });
}
