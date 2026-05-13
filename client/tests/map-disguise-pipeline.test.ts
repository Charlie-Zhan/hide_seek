import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { LocalGameEngine } from '../assets/scripts/gameplay/LocalGameEngine';
import { createLocalGameSetupFromMap } from '../assets/scripts/gameplay/LocalGameMapAdapter';
import { RoundPhase, type GameConfig } from '../assets/scripts/gameplay/LocalGameTypes';
import { MapManager, type LoadedMapState, type LocalMapConfigInput } from '../assets/scripts/map/MapManager';
import type { PropInstanceState } from '../assets/scripts/map/PropInstance';

const ROOT = join(import.meta.dirname, '..', '..');
const MAP_CONFIG = readJson<LocalMapConfigInput>('client/assets/resources/configs/map_kitchen_01.json');
const DISGUISE_CONFIG = readJson<{ props: Array<{ id: string; radius: number }> }>('client/assets/resources/configs/disguise_props.json');

const TEST_CONFIG: GameConfig = {
  previewDurationMs: 1000,
  hideDurationMs: 1000,
  seekDurationMs: 1000,
  resultDurationMs: 1000,
  attackSectorDeg: 90,
  attackRadiusPx: 120,
  attackCountMultiplier: 2,
  hiderHideSpeed: 220,
  hiderSeekSpeed: 90,
  seekerSpeed: 220
};

const EXPECTED_POOL = ['wooden_crate', 'trash_bin', 'plant_pot', 'chair', 'water_bucket', 'food_basket'];

describe('Phase 02 kitchen map disguise pipeline', () => {
  it('loads kitchen_01 counts, layers, spawns, and exact disguise pool', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);
    const mapState = withConfiguredRadii(mapManager.getLoadedMapState());

    assert.equal(mapState.mapId, 'kitchen_01');
    assert.equal(mapState.width, 1280);
    assert.equal(mapState.height, 720);
    assert.equal(mapState.spawnPoints.length, 4);
    assert.ok(mapState.seekerSpawnPoint);
    assert.equal(mapState.props.filter((prop) => prop.isBreakable).length, 28);
    assert.equal(mapState.obstacles.length, 8);
    assert.equal(mapState.occluders.length, 6);
    assert.deepEqual(mapState.disguiseProps, EXPECTED_POOL);
    assert.ok(mapState.occluders.every((occluder) => occluder.layer === 'object_front'));
  });

  it('prevents destroyed breakable props from being destroyed twice', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);

    assert.equal(mapManager.markPropDestroyed('crate_01'), true);
    assert.equal(mapManager.markPropDestroyed('crate_01'), false);
    assert.deepEqual(mapManager.getDestroyedPropIds(), ['crate_01']);
    assert.equal(mapManager.getActiveBreakablePropStates().length, 27);
  });

  it('adapts kitchen map into local gameplay setup and restricts hider disguise cycling to the map pool', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);
    const mapState = withConfiguredRadii(mapManager.getLoadedMapState());
    const setup = createLocalGameSetupFromMap(mapState, TEST_CONFIG, [
      { playerId: 'p1', displayName: 'Seeker' },
      { playerId: 'p2', displayName: 'Hider A' },
      { playerId: 'p3', displayName: 'Hider B' },
      { playerId: 'p4', displayName: 'Hider C' }
    ]);

    assert.deepEqual(setup.availablePropIds, EXPECTED_POOL);
    assert.equal(setup.props.length, 28);
    assert.deepEqual(setup.players[0]?.startPosition, mapState.seekerSpawnPoint?.position);
    assert.deepEqual(setup.players[1]?.startPosition, mapState.spawnPoints[0]?.position);

    const engine = new LocalGameEngine(setup);
    engine.debugForceNextPhase();

    const cycled = [getPlayerProp(engine, 'p2')];
    for (let i = 0; i < EXPECTED_POOL.length; i += 1) {
      assert.equal(engine.switchDisguise('p2'), true);
      cycled.push(getPlayerProp(engine, 'p2'));
    }

    assert.deepEqual(cycled, [...EXPECTED_POOL, EXPECTED_POOL[0]]);
  });

  it('can complete a local kitchen round with sector attacks destroying multiple mapped props', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);
    const mapState = withConfiguredRadii(mapManager.getLoadedMapState());
    const setup = createLocalGameSetupFromMap(mapState, TEST_CONFIG, [
      { playerId: 'p1', displayName: 'Seeker', startFacing: { x: -1, y: 0 } },
      { playerId: 'p2', displayName: 'Hider A', startFacing: { x: 1, y: 0 } }
    ]);
    setup.players[0] = {
      ...setup.players[0],
      startPosition: { x: 245, y: 250 },
      startFacing: { x: 0, y: -1 }
    };
    setup.players[1] = {
      ...setup.players[1],
      startPosition: { x: 170, y: 172 },
      initialPropId: 'wooden_crate'
    };

    const engine = new LocalGameEngine(setup);
    engine.debugForceNextPhase();
    engine.debugForceNextPhase();

    const attack = engine.attack('p1');
    assert.equal(attack.accepted, true);
    assert.ok(attack.destroyedPropIds.includes('crate_01'));
    assert.ok(attack.destroyedPropIds.includes('basket_01'));
    assert.deepEqual(attack.capturedPlayerIds, ['p2']);
    assert.equal(engine.getSnapshot().phase, RoundPhase.Result);
  });
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;
}

function withConfiguredRadii(mapState: LoadedMapState): LoadedMapState {
  const radiusByPropId = new Map(DISGUISE_CONFIG.props.map((prop) => [prop.id, prop.radius]));
  return {
    ...mapState,
    props: mapState.props.map((prop) => withRadius(prop, radiusByPropId))
  };
}

function withRadius(prop: PropInstanceState, radiusByPropId: Map<string, number>): PropInstanceState {
  return {
    ...prop,
    radius: radiusByPropId.get(prop.propId) ?? prop.radius
  };
}

function getPlayerProp(engine: LocalGameEngine, playerId: string): string {
  const player = engine.getSnapshot().players.find((candidate) => candidate.playerId === playerId);
  assert.ok(player, `Expected player ${playerId}`);
  return player.currentPropId;
}
