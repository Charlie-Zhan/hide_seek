import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomService } from '../src/rooms/RoomService.js';

test('creates a room with a normalized host player', () => {
  const service = new RoomService({ nowMs: () => 1000 });

  const result = service.createRoom('player_a', '  Alice  ');

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.status, 'waiting');
  assert.equal(result.value.mapId, 'kitchen_01');
  assert.equal(result.value.minPlayers, 2);
  assert.equal(result.value.maxPlayers, 4);
  assert.equal(result.value.players.length, 1);
  assert.equal(result.value.players[0]?.playerName, 'Alice');
  assert.equal(result.value.players[0]?.displayName, 'Alice');
  assert.equal(result.value.players[0]?.ready, false);
  assert.equal(result.value.players[0]?.connected, true);
  assert.equal(result.value.players[0]?.isOwner, true);
});

test('rejects invalid names and duplicate joins', () => {
  const service = new RoomService();

  const invalidName = service.createRoom('player_a', '   ');
  assert.equal(invalidName.ok, false);
  if (!invalidName.ok) {
    assert.equal(invalidName.error.code, 'invalid_player_name');
  }

  const created = service.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  const duplicate = service.joinRoom(created.value.roomId, 'player_a', 'Alice');
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error.code, 'duplicate_join');
  }
});

test('joins rooms, toggles ready, and starts only when owner and all players are ready', () => {
  const service = new RoomService({ nowMs: () => 2000 });
  const created = service.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  const notEnough = service.startMatch('player_a');
  assert.equal(notEnough.ok, false);
  if (!notEnough.ok) {
    assert.equal(notEnough.error.code, 'not_enough_players');
  }

  const joined = service.joinRoom(created.value.roomId.toLowerCase(), 'player_b', 'Bob');
  assert.equal(joined.ok, true);
  if (!joined.ok) {
    return;
  }
  assert.equal(joined.value.players.length, 2);

  const ready = service.setReady('player_b', true);
  assert.equal(ready.ok, true);
  if (!ready.ok) {
    return;
  }
  assert.equal(ready.value.players.find((player) => player.playerId === 'player_b')?.ready, true);

  const nonOwnerStart = service.startMatch('player_b');
  assert.equal(nonOwnerStart.ok, false);
  if (!nonOwnerStart.ok) {
    assert.equal(nonOwnerStart.error.code, 'not_room_owner');
  }

  const hostNotReady = service.startMatch('player_a');
  assert.equal(hostNotReady.ok, false);
  if (!hostNotReady.ok) {
    assert.equal(hostNotReady.error.code, 'players_not_ready');
  }

  assert.equal(service.setReady('player_a', true).ok, true);

  const started = service.startMatch('player_a');
  assert.equal(started.ok, true);
  if (!started.ok) {
    return;
  }
  assert.equal(started.value.status, 'playing');
  assert.equal(typeof started.value.startedAtMs, 'number');

  const startedAgain = service.startMatch('player_a');
  assert.equal(startedAgain.ok, false);
  if (!startedAgain.ok) {
    assert.equal(startedAgain.error.code, 'match_already_started');
  }
});

test('resume restores disconnected players in a playing room', () => {
  const service = new RoomService({ nowMs: () => 3000 });
  const created = service.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  assert.equal(service.joinRoom(created.value.roomId, 'player_b', 'Bob').ok, true);
  assert.equal(service.setReady('player_a', true).ok, true);
  assert.equal(service.setReady('player_b', true).ok, true);
  const started = service.startMatch('player_b');
  assert.equal(started.ok, false);
  if (!started.ok) {
    assert.equal(started.error.code, 'not_room_owner');
  }

  const ownerStarted = service.startMatch('player_a');
  assert.equal(ownerStarted.ok, true);

  const disconnected = service.disconnectPlayer('player_b');
  assert.equal(disconnected.ok, true);
  if (!disconnected.ok) {
    return;
  }
  assert.equal(disconnected.value.room?.players.find((player) => player.playerId === 'player_b')?.connected, false);

  const duplicateJoin = service.joinRoom(created.value.roomId, 'player_b', 'Bob');
  assert.equal(duplicateJoin.ok, false);
  if (!duplicateJoin.ok) {
    assert.equal(duplicateJoin.error.code, 'match_already_started');
  }

  const resumed = service.resumeRoom(created.value.roomId.toLowerCase(), 'player_b', 'Bob');
  assert.equal(resumed.ok, true);
  if (!resumed.ok) {
    return;
  }
  assert.equal(resumed.value.status, 'playing');
  assert.equal(resumed.value.players.find((player) => player.playerId === 'player_b')?.connected, true);
});

test('owner can reset a finished room to waiting with ready flags cleared', () => {
  const service = new RoomService({ nowMs: () => 4000 });
  const created = service.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  assert.equal(service.joinRoom(created.value.roomId, 'player_b', 'Bob').ok, true);
  assert.equal(service.setReady('player_a', true).ok, true);
  assert.equal(service.setReady('player_b', true).ok, true);
  assert.equal(service.startMatch('player_a').ok, true);
  assert.equal(service.finishMatch(created.value.roomId).ok, true);

  const nonOwnerRestart = service.restartFinishedRoom('player_b');
  assert.equal(nonOwnerRestart.ok, false);
  if (!nonOwnerRestart.ok) {
    assert.equal(nonOwnerRestart.error.code, 'not_room_owner');
  }

  const restarted = service.restartFinishedRoom('player_a');
  assert.equal(restarted.ok, true);
  if (!restarted.ok) {
    return;
  }
  assert.equal(restarted.value.status, 'waiting');
  assert.equal(restarted.value.startedAtMs, undefined);
  assert.equal(restarted.value.players.every((player) => !player.ready), true);
});

test('enforces max players', () => {
  const service = new RoomService({ maxPlayers: 2 });
  const created = service.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  assert.equal(service.joinRoom(created.value.roomId, 'player_b', 'Bob').ok, true);
  const full = service.joinRoom(created.value.roomId, 'player_c', 'Cara');

  assert.equal(full.ok, false);
  if (!full.ok) {
    assert.equal(full.error.code, 'room_full');
  }
});

test('disconnect removes waiting-room players and deletes empty rooms', () => {
  const service = new RoomService();
  const created = service.createRoom('player_a', 'Alice');
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }

  assert.equal(service.joinRoom(created.value.roomId, 'player_b', 'Bob').ok, true);

  const removedHost = service.disconnectPlayer('player_a');
  assert.equal(removedHost.ok, true);
  if (!removedHost.ok) {
    return;
  }
  assert.equal(removedHost.value.roomDeleted, false);
  assert.equal(removedHost.value.room?.ownerPlayerId, 'player_b');
  assert.equal(removedHost.value.room?.players.length, 1);

  const removedLast = service.disconnectPlayer('player_b');
  assert.equal(removedLast.ok, true);
  if (!removedLast.ok) {
    return;
  }
  assert.equal(removedLast.value.roomDeleted, true);
  assert.equal(service.getRoom(created.value.roomId), undefined);
});
