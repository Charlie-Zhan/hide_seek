import type { Size2, Vector2 } from '../types/geometry.js';

export type MapLayerName =
  | 'ground'
  | 'object_back'
  | 'player'
  | 'object_front';

export interface MapSpawnPointConfig {
  id: string;
  position: Vector2;
  facingDeg?: number;
}

export interface MapPropInstanceConfig {
  id: string;
  propConfigId: string;
  position: Vector2;
  rotationDeg?: number;
  layer: MapLayerName;
}

export interface MapObstacleConfig {
  id: string;
  position: Vector2;
  size: Size2;
  layer: MapLayerName;
}

export interface MapConfig {
  id: string;
  displayName: string;
  size: Size2;
  backgroundSpritePath?: string;
  spawnPoints: MapSpawnPointConfig[];
  propInstances: MapPropInstanceConfig[];
  obstacles: MapObstacleConfig[];
  disguisePropIds: string[];
}
