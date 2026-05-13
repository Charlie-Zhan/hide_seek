import { _decorator, Component } from 'cc';
import { PropInstance, type PropInstanceState, type PropPosition } from './PropInstance';

const { ccclass } = _decorator;

export interface MapSizeConfig {
  width: number;
  height: number;
}

export interface MapPointConfigInput {
  id?: string;
  x?: number;
  y?: number;
  position?: PropPosition;
  facingDeg?: number;
}

export interface LoadedMapSpawnPoint {
  id: string;
  position: PropPosition;
  facingDeg?: number;
}

export interface MapPropConfigInput {
  id: string;
  configId?: string;
  propId?: string;
  propConfigId?: string;
  x?: number;
  y?: number;
  position?: PropPosition;
  layer?: string;
  radius?: number;
  isBreakable?: boolean;
  breakable?: boolean;
  isDisguiseCandidate?: boolean;
}

export interface MapVolumeConfigInput {
  id: string;
  x?: number;
  y?: number;
  position?: PropPosition;
  width?: number;
  height?: number;
  size?: MapSizeConfig;
  layer?: string;
  radius?: number;
}

export interface LoadedMapVolumeState {
  id: string;
  position: PropPosition;
  size: MapSizeConfig;
  layer: string;
  radius?: number;
}

export interface LocalMapConfigInput {
  mapId?: string;
  id?: string;
  displayName?: string;
  width?: number;
  height?: number;
  size?: MapSizeConfig;
  spawnPoints?: MapPointConfigInput[];
  seekerSpawnPoint?: MapPointConfigInput;
  props?: MapPropConfigInput[];
  propInstances?: MapPropConfigInput[];
  occluders?: MapVolumeConfigInput[];
  obstacles?: MapVolumeConfigInput[];
  disguiseProps?: string[];
  disguisePropIds?: string[];
}

export interface LoadedMapState {
  mapId: string;
  displayName: string;
  width: number;
  height: number;
  size: MapSizeConfig;
  spawnPoints: LoadedMapSpawnPoint[];
  seekerSpawnPoint: LoadedMapSpawnPoint | null;
  props: PropInstanceState[];
  occluders: LoadedMapVolumeState[];
  obstacles: LoadedMapVolumeState[];
  disguiseProps: string[];
}

@ccclass('MapManager')
export class MapManager extends Component {
  private mapId = '';
  private displayName = '';
  private size: MapSizeConfig = { width: 0, height: 0 };
  private spawnPoints: LoadedMapSpawnPoint[] = [];
  private seekerSpawnPoint: LoadedMapSpawnPoint | null = null;
  private occluders: LoadedMapVolumeState[] = [];
  private obstacles: LoadedMapVolumeState[] = [];
  private disguiseProps: string[] = [];
  private readonly props = new Map<string, PropInstance>();

  public loadMap(config: LocalMapConfigInput): void {
    this.mapId = normalizeMapId(config.mapId ?? config.id ?? '');
    this.displayName = config.displayName ?? this.mapId;
    this.size = normalizeSize(config);
    this.spawnPoints = (config.spawnPoints ?? []).map((spawnPoint, index) => toSpawnPoint(spawnPoint, index));
    this.seekerSpawnPoint = config.seekerSpawnPoint ? toSpawnPoint(config.seekerSpawnPoint, -1, 'seeker_spawn') : null;
    this.occluders = (config.occluders ?? []).map((occluder) => toVolumeState(occluder, 'object_front'));
    this.obstacles = (config.obstacles ?? []).map((obstacle) => toVolumeState(obstacle, 'object_back'));
    this.disguiseProps = [...(config.disguiseProps ?? config.disguisePropIds ?? [])];
    this.props.clear();

    for (const propConfig of config.props ?? config.propInstances ?? []) {
      const prop = new PropInstance();
      prop.configure(toPropState(propConfig, this.disguiseProps));
      this.props.set(prop.getInstanceId(), prop);
    }
  }

  public clearMap(): void {
    this.mapId = '';
    this.displayName = '';
    this.size = { width: 0, height: 0 };
    this.spawnPoints = [];
    this.seekerSpawnPoint = null;
    this.occluders = [];
    this.obstacles = [];
    this.disguiseProps = [];
    this.props.clear();
  }

  public getLoadedMapState(): LoadedMapState {
    return {
      mapId: this.mapId,
      displayName: this.displayName,
      width: this.size.width,
      height: this.size.height,
      size: { ...this.size },
      spawnPoints: this.getSpawnPoints(),
      seekerSpawnPoint: this.getSeekerSpawnPoint(),
      props: this.getPropStates(),
      occluders: this.getOccluders(),
      obstacles: this.getObstacles(),
      disguiseProps: this.getDisguisePropPool()
    };
  }

  public getMapId(): string {
    return this.mapId;
  }

  public getMapSize(): MapSizeConfig {
    return { ...this.size };
  }

  public getSpawnPoints(): LoadedMapSpawnPoint[] {
    return this.spawnPoints.map(cloneSpawnPoint);
  }

  public getSeekerSpawnPoint(): LoadedMapSpawnPoint | null {
    return this.seekerSpawnPoint ? cloneSpawnPoint(this.seekerSpawnPoint) : null;
  }

  public getOccluders(): LoadedMapVolumeState[] {
    return this.occluders.map(cloneVolumeState);
  }

  public getObstacles(): LoadedMapVolumeState[] {
    return this.obstacles.map(cloneVolumeState);
  }

  public getDisguisePropPool(): string[] {
    return [...this.disguiseProps];
  }

  public getPropStates(): PropInstanceState[] {
    return [...this.props.values()].map((prop) => prop.getState());
  }

  public getBreakablePropStates(): PropInstanceState[] {
    return this.getPropStates().filter((prop) => prop.isBreakable);
  }

  public getActiveBreakablePropStates(): PropInstanceState[] {
    return this.getBreakablePropStates().filter((prop) => !prop.destroyed);
  }

  public getPropState(instanceId: string): PropInstanceState | null {
    return this.props.get(instanceId)?.getState() ?? null;
  }

  public markPropDestroyed(instanceId: string): boolean {
    return this.props.get(instanceId)?.markDestroyed() ?? false;
  }

  public resetDestroyedProps(): void {
    for (const prop of this.props.values()) {
      prop.resetDestroyed();
    }
  }

  public getDestroyedPropIds(): string[] {
    return [...this.props.values()]
      .filter((prop) => prop.isDestroyed())
      .map((prop) => prop.getInstanceId());
  }
}

function normalizeMapId(id: string): string {
  return id === 'map_kitchen_01' ? 'kitchen_01' : id;
}

function normalizeSize(config: LocalMapConfigInput): MapSizeConfig {
  return {
    width: config.width ?? config.size?.width ?? 0,
    height: config.height ?? config.size?.height ?? 0
  };
}

function toSpawnPoint(config: MapPointConfigInput, index: number, fallbackId = 'spawn'): LoadedMapSpawnPoint {
  return {
    id: config.id ?? (index >= 0 ? `${fallbackId}_${index + 1}` : fallbackId),
    position: toPosition(config),
    facingDeg: config.facingDeg
  };
}

function toPropState(config: MapPropConfigInput, mapDisguiseProps: string[]): PropInstanceState {
  const configId = config.configId ?? config.propConfigId ?? config.propId ?? '';
  const propId = config.propId ?? config.configId ?? config.propConfigId ?? '';
  const isBreakable = config.isBreakable ?? config.breakable ?? true;
  const isDisguiseCandidate = config.isDisguiseCandidate ?? (mapDisguiseProps.includes(propId) || mapDisguiseProps.includes(configId));

  return {
    instanceId: config.id,
    configId,
    propId,
    position: toPosition(config),
    layer: config.layer ?? 'object_back',
    radius: config.radius ?? 16,
    destroyed: false,
    isBreakable,
    isDisguiseCandidate,
    breakable: isBreakable
  };
}

function toVolumeState(config: MapVolumeConfigInput, fallbackLayer: string): LoadedMapVolumeState {
  return {
    id: config.id,
    position: toPosition(config),
    size: {
      width: config.width ?? config.size?.width ?? 0,
      height: config.height ?? config.size?.height ?? 0
    },
    layer: config.layer ?? fallbackLayer,
    radius: config.radius
  };
}

function toPosition(config: { x?: number; y?: number; position?: PropPosition }): PropPosition {
  return {
    x: config.position?.x ?? config.x ?? 0,
    y: config.position?.y ?? config.y ?? 0
  };
}

function cloneSpawnPoint(spawnPoint: LoadedMapSpawnPoint): LoadedMapSpawnPoint {
  return {
    ...spawnPoint,
    position: { ...spawnPoint.position }
  };
}

function cloneVolumeState(volume: LoadedMapVolumeState): LoadedMapVolumeState {
  return {
    ...volume,
    position: { ...volume.position },
    size: { ...volume.size }
  };
}
