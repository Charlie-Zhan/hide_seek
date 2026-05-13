import type { LoadedMapState, LoadedMapSpawnPoint } from '../map/MapManager';
import type { PropInstanceState } from '../map/PropInstance';
import type { GameConfig, LocalGameSetup, LocalPropInstance, Vector2 } from './LocalGameTypes';

export interface LocalGameMapPlayerInput {
  playerId: string;
  displayName: string;
  startFacing?: Vector2;
  initialPropId?: string;
}

export interface LocalGameMapSetupPieces {
  availablePropIds: string[];
  props: LocalPropInstance[];
  players: LocalGameSetup['players'];
  seekerSpawnPoint: Vector2;
  spawnPoints: Vector2[];
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
    players: players.map((player, index) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      startPosition: index === 0 ? cloneVector(seekerSpawnPoint) : getSpawnForPlayer(spawnPoints, index - 1),
      startFacing: player.startFacing ? cloneVector(player.startFacing) : undefined,
      initialPropId: player.initialPropId ?? getInitialPropId(availablePropIds, index - 1)
    })),
    seekerSpawnPoint,
    spawnPoints
  };
}

export function toLocalPropInstance(prop: PropInstanceState): LocalPropInstance {
  return {
    instanceId: prop.instanceId,
    propId: prop.propId || prop.configId,
    position: cloneVector(prop.position),
    radius: prop.radius,
    breakable: prop.isBreakable,
    destroyed: prop.destroyed
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
