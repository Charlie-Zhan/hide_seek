import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AuthoritativeMatch,
  RoundPhase,
  type GameConfig,
  type MatchPlayerSetup,
  type ServerMapFixture,
} from '../src/game/index.js';
import { RoomService } from '../src/rooms/RoomService.js';

const PHASE07_FIXTURE: ServerMapFixture = {
  mapId: 'kitchen_01',
  width: 160,
  height: 120,
  seekerSpawn: { x: 20, y: 60 },
  seekerFacing: { x: 1, y: 0 },
  hiderSpawns: [{ x: 70, y: 60 }],
  propPool: ['wooden_crate', 'water_bucket'],
  propRadiusById: {
    wooden_crate: 10,
    water_bucket: 10,
  },
  props: [
    {
      propInstanceId: 'crate_near',
      propConfigId: 'wooden_crate',
      position: { x: 55, y: 60 },
      radius: 10,
      breakable: true,
      destroyed: false,
    },
    {
      propInstanceId: 'bucket_far',
      propConfigId: 'water_bucket',
      position: { x: 145, y: 100 },
      radius: 10,
      breakable: true,
      destroyed: false,
    },
  ],
};

const SMOKE_CONFIG: Partial<GameConfig> = {
  previewDurationMs: 5,
  hideDurationMs: 5,
  seekDurationMs: 20000,
  resultDurationMs: 5,
  attackSectorDeg: 90,
  attackRadiusPx: 80,
  attackCountMultiplier: 2,
  hiderHideSpeed: 100,
  hiderSeekSpeed: 40,
  seekerSpeed: 100,
};

test('phase 07 smoke covers room share join, full match flow, and clean restart construction', () => {
  const roomService = new RoomService({ nowMs: fixedNow(1000), roomCodeLength: 4 });
  const created = roomService.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  const sharedRoomCode = created.value.roomId.toLowerCase();
  const joined = roomService.joinRoom(sharedRoomCode, 'player_b', 'Bob');
  assert.equal(joined.ok, true);
  if (!joined.ok) {
    return;
  }
  assert.equal(joined.value.roomId, created.value.roomId);
  assert.deepEqual(joined.value.players.map((player) => player.playerId), ['player_a', 'player_b']);

  const started = roomService.startMatch('player_a');
  assert.equal(started.ok, true);
  if (!started.ok) {
    return;
  }
  assert.equal(started.value.status, 'playing');

  const players = started.value.players.map<MatchPlayerSetup>((player) => ({
    playerId: player.playerId,
    displayName: player.displayName,
  }));
  const match = createSmokeMatch(started.value.roomId, players);

  assert.equal(match.getSnapshot().phase, RoundPhase.Preview);
  match.handleInput('player_a', { moveX: 1, moveY: 0, action: 'attack' });
  match.handleInput('player_b', { moveX: 1, moveY: 0, action: 'switch_prop' });
  match.tick(1);
  assert.equal(match.getSnapshot().players.find((player) => player.playerId === 'player_a')?.position.x, 20);
  assert.equal(match.getSnapshot().players.find((player) => player.playerId === 'player_b')?.position.x, 70);

  match.tick(4);
  assert.equal(match.getSnapshot().phase, RoundPhase.Hide);
  match.handleInput('player_a', { moveX: 1, moveY: 0, action: 'attack' });
  match.handleInput('player_b', { moveX: 1, moveY: 0, action: 'switch_prop' });
  match.tick(1);
  let snapshot = match.getSnapshot();
  assert.equal(snapshot.players.find((player) => player.playerId === 'player_a')?.position.x, 20);
  assert.equal(snapshot.players.find((player) => player.playerId === 'player_b')?.position.x, 70.1);
  assert.equal(snapshot.players.find((player) => player.playerId === 'player_b')?.currentPropId, 'wooden_crate');

  match.tick(4);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);
  assert.equal(match.getSnapshot().attackCountRemaining, 2);
  match.handleInput('player_a', { moveX: 0, moveY: 0, action: 'attack' });
  snapshot = match.getSnapshot(true);
  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.scores.player_a, 2);
  assert.equal(snapshot.scores.player_b, 0);
  assert.ok(snapshot.events.some((event) => event.type === 'props_destroyed' && event.propIds.includes('crate_near')));
  assert.ok(snapshot.events.some((event) => event.type === 'hider_captured' && event.hiderId === 'player_b'));

  match.tick(5);
  assert.equal(match.getSnapshot().phase, RoundPhase.Preview);
  assert.equal(match.getSnapshot().seekerPlayerId, 'player_b');

  match.tick(5);
  match.tick(5);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);
  match.handleInput('player_b', { moveX: 0, moveY: 0, action: 'attack' });
  assert.equal(match.getSnapshot().phase, RoundPhase.Result);

  match.tick(5);
  assert.equal(match.getSnapshot().phase, RoundPhase.MatchEnd);
  assert.equal(match.getSnapshot().matchEnded, true);

  const finished = roomService.finishMatch(started.value.roomId);
  assert.equal(finished.ok, true);
  if (!finished.ok) {
    return;
  }
  assert.equal(finished.value.status, 'finished');

  const restarted = createSmokeMatch('RESTART', players);
  const restartSnapshot = restarted.getSnapshot();
  assert.equal(restartSnapshot.phase, RoundPhase.Preview);
  assert.equal(restartSnapshot.roundIndex, 0);
  assert.equal(restartSnapshot.attackCountRemaining, 0);
  assert.deepEqual(restartSnapshot.scores, { player_a: 0, player_b: 0 });
  assert.equal(restartSnapshot.players.some((player) => player.captured), false);
  assert.equal(restartSnapshot.props.some((prop) => prop.isDestroyed), false);
});

test('phase 07 smoke covers reconnect before grace timeout and seeker disconnect result', () => {
  const match = createSmokeMatch('NET1', [
    { playerId: 'seeker', displayName: 'Seeker' },
    { playerId: 'hider', displayName: 'Hider' },
  ]);
  match.tick(5);
  match.tick(5);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);

  match.handlePlayerDisconnected('hider');
  match.tick(5000);
  assert.equal(match.getSnapshot().players.find((player) => player.playerId === 'hider')?.connected, false);

  match.handleInput('hider', { moveX: 0, moveY: 0, action: 'switch_prop' });
  let snapshot = match.tick(1);
  assert.equal(snapshot.phase, RoundPhase.Seek);
  assert.equal(snapshot.players.find((player) => player.playerId === 'hider')?.connected, true);
  assert.equal(snapshot.players.find((player) => player.playerId === 'hider')?.captured, false);

  match.handlePlayerDisconnected('seeker');
  snapshot = match.tick(10000);
  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.scores.seeker, 0);
  assert.equal(snapshot.scores.hider, 1);
  assert.ok(snapshot.events.some((event) => event.type === 'round_ended' && event.reason === 'seeker_disconnected'));
});

function createSmokeMatch(roomId: string, players: MatchPlayerSetup[]): AuthoritativeMatch {
  return new AuthoritativeMatch({
    roomId,
    players,
    config: SMOKE_CONFIG,
    fixture: PHASE07_FIXTURE,
  });
}

function fixedNow(startMs: number): () => number {
  let nowMs = startMs;
  return () => {
    nowMs += 1;
    return nowMs;
  };
}
