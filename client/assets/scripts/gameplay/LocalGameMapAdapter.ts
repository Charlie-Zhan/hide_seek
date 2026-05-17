import type { LoadedMapState, LoadedMapSpawnPoint, LoadedMapVolumeState } from '../map/MapManager';
import type { PropInstanceState } from '../map/PropInstance';
import type { GameConfig, LocalCollisionRect, LocalGameSetup, LocalMovementBounds, LocalPropInstance, Vector2 } from './LocalGameTypes';

export interface LocalGameMapPlayerInput {
  playerId: string;
  displayName: string;
  startFacing?: Vector2;
  initialPropId?: string;
}

export interface LocalGameMapSetupPieces {
  availablePropIds: string[];
  props: LocalPropInstance[];
  obstacles: LocalCollisionRect[];
  players: LocalGameSetup['players'];
  seekerSpawnPoint: Vector2;
  spawnPoints: Vector2[];
  mapSize: { width: number; height: number };
  movementBounds: LocalMovementBounds;
}

export interface LocalGameMapSetupOptions {
  hideIdleDisguiseMs?: number;
}

export function createLocalGameSetupFromMap(
  mapState: LoadedMapState,
  gameConfig: GameConfig,
  players: LocalGameMapPlayerInput[],
  options: LocalGameMapSetupOptions = {}
): LocalGameSetup {
  const pieces = createLocalGameMapSetupPieces(mapState, players);

  return {
    gameConfig,
    players: pieces.players,
    availablePropIds: pieces.availablePropIds,
    props: pieces.props,
    obstacles: pieces.obstacles,
    mapSize: pieces.mapSize,
    seekerSpawnPoint: pieces.seekerSpawnPoint,
    spawnPoints: pieces.spawnPoints,
    movementBounds: pieces.movementBounds,
    hideIdleDisguiseMs: options.hideIdleDisguiseMs
  };
}

export function createLocalGameMapSetupPieces(
  mapState: LoadedMapState,
  players: LocalGameMapPlayerInput[]
): LocalGameMapSetupPieces {
  const availablePropIds = getAvailablePropIds(mapState);
  const spawnPoints = getHiderSpawnPoints(mapState);
  const seekerSpawnPoint = cloneVector(mapState.seekerSpawnPoint?.position ?? spawnPoints[0] ?? { x: 0, y: 0 });

  return {
    availablePropIds,
    props: mapState.props.map(toLocalPropInstance),
    obstacles: getBlockingVolumes(mapState),
    players: players.map((player, index) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      startPosition: index === 0 ? cloneVector(seekerSpawnPoint) : getSpawnForPlayer(spawnPoints, index - 1),
      startFacing: player.startFacing ? cloneVector(player.startFacing) : undefined,
      initialPropId: player.initialPropId ?? getInitialPropId(availablePropIds, index - 1)
    })),
    seekerSpawnPoint,
    spawnPoints,
    mapSize: { width: mapState.width, height: mapState.height },
    movementBounds: getMapMovementBounds(mapState)
  };
}

export function toLocalPropInstance(prop: PropInstanceState): LocalPropInstance {
  return {
    instanceId: prop.instanceId,
    propId: prop.propId || prop.configId,
    position: cloneVector(prop.position),
    radius: prop.radius,
    breakable: prop.isBreakable,
    destroyed: prop.destroyed,
    blocksMovement: prop.blocksMovement
  };
}

function getBlockingVolumes(mapState: LoadedMapState): LocalCollisionRect[] {
  return [...mapState.obstacles, ...mapState.occluders.filter((occluder) => occluder.blocksMovement)]
    .filter((volume) => volume.blocksMovement && !volume.allowsOverlap)
    .map(toLocalCollisionRect);
}

function toLocalCollisionRect(volume: LoadedMapVolumeState): LocalCollisionRect {
  const collisionVolume = toMovementCollisionVolume(volume);
  return {
    id: collisionVolume.id,
    position: cloneVector(collisionVolume.position),
    size: { ...collisionVolume.size },
    blocksMovement: collisionVolume.blocksMovement,
    allowsOverlap: collisionVolume.allowsOverlap
  };
}

function toMovementCollisionVolume(volume: LoadedMapVolumeState): LoadedMapVolumeState {
  if (!isStandingFixtureVolume(volume.id)) {
    return volume;
  }

  return {
    ...volume,
    position: {
      x: volume.position.x + volume.size.width * 0.18,
      y: volume.position.y + volume.size.height * 0.72
    },
    size: {
      width: volume.size.width * 0.64,
      height: volume.size.height * 0.24
    }
  };
}

function isStandingFixtureVolume(volumeId: string): boolean {
  return volumeId === 'obstacle_fridge' ||
    volumeId === 'obstacle_pantry' ||
    volumeId === 'obstacle_crate_shelf';
}

function getMapMovementBounds(mapState: LoadedMapState): LocalMovementBounds {
  const inset = Math.min(80, Math.max(0, mapState.width / 4), Math.max(0, mapState.height / 4));
  return {
    minX: inset,
    minY: inset,
    maxX: mapState.width - inset,
    maxY: mapState.height - inset
  };
}

function getAvailablePropIds(mapState: LoadedMapState): string[] {
  if (mapState.disguiseProps.length > 0) {
    return [...mapState.disguiseProps];
  }

  const propIds = new Set<string>();
  for (const prop of mapState.props) {
    const propId = prop.propId || prop.configId;
    if (prop.isDisguiseCandidate && propId) {
      propIds.add(propId);
    }
  }

  return [...propIds];
}

function getHiderSpawnPoints(mapState: LoadedMapState): Vector2[] {
  const seekerSpawnId = mapState.seekerSpawnPoint?.id;
  return mapState.spawnPoints
    .filter((spawnPoint) => spawnPoint.id !== seekerSpawnId)
    .map((spawnPoint) => cloneVector(spawnPoint.position));
}

function getSpawnForPlayer(spawnPoints: Vector2[], hiderIndex: number): Vector2 {
  if (spawnPoints.length === 0) {
    return { x: 0, y: 0 };
  }

  return cloneVector(spawnPoints[hiderIndex % spawnPoints.length]);
}

function getInitialPropId(availablePropIds: string[], hiderIndex: number): string | undefined {
  if (hiderIndex < 0 || availablePropIds.length === 0) {
    return undefined;
  }

  return availablePropIds[hiderIndex % availablePropIds.length];
}

function cloneVector(vector: Vector2 | LoadedMapSpawnPoint['position']): Vector2 {
  return {
    x: vector.x,
    y: vector.y
  };
}
