import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { LocalGameEngine } from '../assets/scripts/gameplay/LocalGameEngine';
import { createLocalGameMapSetupPieces, createLocalGameSetupFromMap } from '../assets/scripts/gameplay/LocalGameMapAdapter';
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
    assert.equal(mapState.width, 1440);
    assert.equal(mapState.height, 810);
    assert.equal(mapState.spawnPoints.length, 4);
    assert.ok(mapState.seekerSpawnPoint);
    assert.equal(mapState.props.filter((prop) => prop.isBreakable).length, 35);
    assert.equal(mapState.obstacles.length, 6);
    assert.equal(mapState.occluders.length, 6);
    assert.deepEqual(mapState.disguiseProps, EXPECTED_POOL);
    assert.ok(mapState.occluders.every((occluder) => occluder.layer === 'object_front'));
    assert.ok(mapState.obstacles.every((obstacle) => obstacle.blocksMovement && !obstacle.allowsOverlap));
    assert.ok(mapState.occluders.every((occluder) => occluder.allowsOverlap && !occluder.blocksMovement));
    assert.equal(
      (MAP_CONFIG.obstacles ?? []).some(
        (obstacle) =>
          /rug|carpet|mat|floor/i.test(`${obstacle.id} ${obstacle.configId}`) &&
          obstacle.blocksMovement !== false
      ),
      false
    );
  });

  it('keeps solid obstacle footprint small enough for readable walking lanes', () => {
    const mapArea = MAP_CONFIG.width * MAP_CONFIG.height;
    const obstacleArea = (MAP_CONFIG.obstacles ?? []).reduce(
      (total, obstacle) => total + (obstacle.size?.width ?? 0) * (obstacle.size?.height ?? 0),
      0
    );

    assert.ok(obstacleArea / mapArea <= 0.08, `solid obstacle area should stay under 8%; got ${((obstacleArea / mapArea) * 100).toFixed(2)}%`);
  });

  it('uses standing fixture base footprints and inner map bounds for mapped local gameplay', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);
    const mapState = mapManager.getLoadedMapState();
    const pieces = createLocalGameMapSetupPieces(mapState, [
      { playerId: 'p1', displayName: 'P1' },
      { playerId: 'p2', displayName: 'P2' }
    ]);
    const visualFridge = mapState.obstacles.find((obstacle) => obstacle.id === 'obstacle_fridge');
    const collisionFridge = pieces.obstacles.find((obstacle) => obstacle.id === 'obstacle_fridge');

    assert.ok(visualFridge);
    assert.ok(collisionFridge);
    assert.ok(collisionFridge.position.y > visualFridge.position.y);
    assert.ok(collisionFridge.size.height < visualFridge.size.height / 2);
    assert.deepEqual(pieces.movementBounds, { minX: 80, minY: 80, maxX: 1360, maxY: 730 });
  });

  it('keeps hider spawn points out of the dense crate stack choke zone', () => {
    const crateStackZone = MAP_CONFIG.layoutZones?.find((zone) => zone.id === 'crate_stack')?.bounds;
    assert.ok(crateStackZone);

    for (const spawn of MAP_CONFIG.spawnPoints ?? []) {
      if (spawn.roleHint !== 'hider') {
        continue;
      }
      assert.equal(
        isPointInsideRect({ x: spawn.x, y: spawn.y }, crateStackZone),
        false,
        `${spawn.id} should not start a hider inside the crate stack zone`
      );
    }
  });

  it('keeps blocking prop collision circles out of solid obstacle rectangles', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);
    const mapState = withConfiguredRadii(mapManager.getLoadedMapState());
    const solidObstacles = mapState.obstacles.filter((obstacle) => obstacle.blocksMovement && !obstacle.allowsOverlap);
    const blockingProps = mapState.props.filter((prop) => prop.blocksMovement && !prop.destroyed);

    for (const prop of blockingProps) {
      for (const obstacle of solidObstacles) {
        const rect = insetRect(obstacle.position, obstacle.size);
        const separation = distanceToRect(prop.position, rect) - getPropMovementRadius(prop.radius);
        assert.ok(
          separation >= 0,
          `${prop.id} should not overlap ${obstacle.id}; separation=${separation.toFixed(2)}`
        );
      }
    }
  });

  it('keeps blocking prop clusters wide enough for an actor to slide around', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);
    const mapState = withConfiguredRadii(mapManager.getLoadedMapState());
    const blockingProps = mapState.props.filter((prop) => prop.blocksMovement && !prop.destroyed);
    const actorDiameter = 24;

    for (let i = 0; i < blockingProps.length; i += 1) {
      for (let j = i + 1; j < blockingProps.length; j += 1) {
        const a = blockingProps[i];
        const b = blockingProps[j];
        assert.ok(a && b);
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const separation = Math.hypot(dx, dy) - getPropMovementRadius(a.radius) - getPropMovementRadius(b.radius) - actorDiameter;
        assert.ok(
          separation >= 0,
          `${a.id} and ${b.id} should leave actor clearance; separation=${separation.toFixed(2)}`
        );
      }
    }
  });

  it('prevents destroyed breakable props from being destroyed twice', () => {
    const mapManager = new MapManager();
    mapManager.loadMap(MAP_CONFIG);

    assert.equal(mapManager.markPropDestroyed('crate_01'), true);
    assert.equal(mapManager.markPropDestroyed('crate_01'), false);
    assert.deepEqual(mapManager.getDestroyedPropIds(), ['crate_01']);
    assert.equal(mapManager.getActiveBreakablePropStates().length, 34);
  });

  it('treats ground decoration props as non-blocking by default', () => {
    const mapManager = new MapManager();
    mapManager.loadMap({
      mapId: 'collision_defaults',
      width: 200,
      height: 120,
      props: [
        {
          id: 'rug_01',
          propId: 'floor_rug',
          layer: 'ground',
          radius: 30,
          breakable: false
        },
        {
          id: 'crate_01',
          propId: 'wooden_crate',
          layer: 'object_back',
          radius: 20,
          breakable: true
        }
      ]
    });

    assert.equal(mapManager.getPropState('rug_01')?.blocksMovement, false);
    assert.equal(mapManager.getPropState('crate_01')?.blocksMovement, true);
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
    assert.equal(setup.props.length, 35);
    assert.equal(setup.obstacles?.length, mapState.obstacles.length);
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
      startPosition: { x: 276, y: 326 },
      startFacing: { x: 0, y: -1 }
    };
    setup.players[1] = {
      ...setup.players[1],
      startPosition: { x: 241, y: 268 },
      initialPropId: 'wooden_crate'
    };
    setup.seekerSpawnPoint = { x: 276, y: 326 };
    setup.spawnPoints = [{ x: 241, y: 268 }];

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

function isPointInsideRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function getPropMovementRadius(propRadius: number): number {
  return Math.max(8, propRadius);
}

function insetRect(
  position: { x: number; y: number },
  size: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height
  };
}

function distanceToRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): number {
  const clampedX = Math.max(rect.x, Math.min(rect.x + rect.width, point.x));
  const clampedY = Math.max(rect.y, Math.min(rect.y + rect.height, point.y));
  return Math.hypot(point.x - clampedX, point.y - clampedY);
}
