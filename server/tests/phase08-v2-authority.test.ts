import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AuthoritativeMatch,
  RoundPhase,
  redactSnapshotForPlayer,
  type GameConfig,
  type ServerMapFixture,
} from '../src/game/index.js';

const PHASE08_FIXTURE: ServerMapFixture = {
  mapId: 'kitchen_01',
  width: 200,
  height: 120,
  seekerSpawn: { x: 20, y: 60 },
  seekerFacing: { x: 1, y: 0 },
  hiderSpawns: [{ x: 100, y: 60 }],
  propPool: ['wooden_crate', 'water_bucket'],
  propRadiusById: {
    wooden_crate: 10,
    water_bucket: 10,
  },
  props: [],
  v2ObjectivePoints: [{ x: 100, y: 60 }],
  v2EventZones: [{ x: 120, y: 60 }],
};

const BASE_CONFIG: Partial<GameConfig> = {
  previewDurationMs: 1,
  hideDurationMs: 1,
  seekDurationMs: 1000,
  resultDurationMs: 1,
  attackSectorDeg: 90,
  attackRadiusPx: 5,
  attackCountMultiplier: 2,
  hiderHideSpeed: 100,
  hiderSeekSpeed: 40,
  seekerSpeed: 100,
};

test('phase 08 v2 state is empty when disabled by default', () => {
  const match = createMatch(BASE_CONFIG);
  const snapshot = match.getSnapshot();

  assert.deepEqual(snapshot.v2Objectives, []);
  assert.deepEqual(snapshot.v2Events, []);
});

test('preview and hide redaction for seeker does not leak hider state through v2', () => {
  const match = createMatch({
    ...BASE_CONFIG,
    v2ObjectivesEnabled: true,
    v2EventsEnabled: true,
  });

  let redacted = redactSnapshotForPlayer(match.getSnapshot(), 'seeker');
  let hider = redacted.players.find((player) => player.playerId === 'hider');
  assert.deepEqual(hider?.position, { x: 0, y: 0 });
  assert.equal(hider?.currentPropId, undefined);
  assert.equal('assignedHiderId' in (redacted.v2Objectives[0] ?? {}), false);
  assert.equal('playerId' in (redacted.v2Objectives[0] ?? {}), false);
  assert.equal('playerPosition' in (redacted.v2Objectives[0] ?? {}), false);
  assert.equal('playerId' in (redacted.v2Events[0] ?? {}), false);
  assert.equal('playerPosition' in (redacted.v2Events[0] ?? {}), false);

  match.tick(1);
  redacted = redactSnapshotForPlayer(match.getSnapshot(), 'seeker');
  hider = redacted.players.find((player) => player.playerId === 'hider');
  assert.equal(redacted.phase, RoundPhase.Hide);
  assert.deepEqual(hider?.position, { x: 0, y: 0 });
  assert.equal(hider?.currentPropId, undefined);
  assert.deepEqual(redacted.props, []);
});

test('enabled v2 hold objective completes once and awards hider at round end', () => {
  const match = createMatch({
    ...BASE_CONFIG,
    v2ObjectivesEnabled: true,
    v2ObjectiveHoldMs: 500,
    v2ObjectiveRadiusPx: 12,
    v2ObjectiveRewardScore: 1,
  });

  match.tick(1);
  match.tick(1);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);

  let snapshot = match.tick(500);
  assert.equal(snapshot.v2Objectives.length, 1);
  assert.equal(snapshot.v2Objectives[0]?.completed, true);
  assert.equal(snapshot.v2Objectives[0]?.completedBy, 'hider');
  assert.ok(snapshot.events.some((event) => event.type === 'v2_objective_completed' && event.hiderId === 'hider'));

  snapshot = match.tick(500);
  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.scores.hider, 2);

  const completedEvents = snapshot.events.filter((event) => event.type === 'v2_objective_completed');
  assert.equal(completedEvents.length, 0);
});

test('captured hider does not receive completed v2 objective reward', () => {
  const match = createMatch({
    ...BASE_CONFIG,
    v2ObjectivesEnabled: true,
    v2ObjectiveHoldMs: 500,
    v2ObjectiveRadiusPx: 12,
    v2ObjectiveRewardScore: 1,
    attackRadiusPx: 120,
  });

  match.tick(1);
  match.tick(1);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);

  let snapshot = match.tick(500);
  assert.equal(snapshot.v2Objectives[0]?.completed, true);

  match.handleInput('seeker', { moveX: 0, moveY: 0, action: 'attack' });
  snapshot = match.getSnapshot();

  assert.equal(snapshot.phase, RoundPhase.Result);
  assert.equal(snapshot.players.find((player) => player.playerId === 'hider')?.captured, true);
  assert.equal(snapshot.scores.hider, 0);
  assert.equal(snapshot.scores.seeker, 2);
});

test('enabled v2 ambient event broadcasts lifecycle without capture or scoring', () => {
  const match = createMatch({
    ...BASE_CONFIG,
    seekDurationMs: 5000,
    v2EventsEnabled: true,
    v2EventStartDelayMs: 200,
    v2EventDurationMs: 300,
    v2EventRadiusPx: 20,
  });

  match.tick(1);
  match.tick(1);
  assert.equal(match.getSnapshot().phase, RoundPhase.Seek);

  let snapshot = match.tick(1);
  assert.equal(snapshot.v2Events.length, 1);
  assert.equal(snapshot.v2Events[0]?.status, 'hint');
  assert.ok(snapshot.events.some((event) => event.type === 'v2_event_hint'));

  snapshot = match.tick(199);
  assert.equal(snapshot.v2Events[0]?.status, 'active');
  assert.ok(snapshot.events.some((event) => event.type === 'v2_event_active'));

  snapshot = match.tick(300);
  assert.equal(snapshot.v2Events[0]?.status, 'ended');
  assert.ok(snapshot.events.some((event) => event.type === 'v2_event_ended'));
  assert.equal(snapshot.players.find((player) => player.playerId === 'hider')?.captured, false);
  assert.deepEqual(snapshot.scores, { seeker: 0, hider: 0 });
});

function createMatch(config: Partial<GameConfig>): AuthoritativeMatch {
  return new AuthoritativeMatch({
    roomId: 'PHASE08',
    players: [
      { playerId: 'seeker', displayName: 'Seeker' },
      { playerId: 'hider', displayName: 'Hider' },
    ],
    config,
    fixture: PHASE08_FIXTURE,
  });
}
