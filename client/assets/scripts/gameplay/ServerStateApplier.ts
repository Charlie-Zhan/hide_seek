import type { GameEvent, PublicPlayerState, PublicPropState } from '@prop-hide-seek/shared';
import type { MapManager } from '../map/MapManager';
import type { GameHUD, GameHUDViewModel } from '../ui/GameHUD';
import { RemoteGameState, type AuthoritativeServerState } from './RemoteGameState';

export interface ServerPlayerViewModel {
  playerId: string;
  displayName: string;
  role: string;
  state: string;
  x: number;
  y: number;
  facingDeg: number;
  currentPropId: string | null;
  score: number;
}

export interface ServerPropViewModel {
  propInstanceId: string;
  propConfigId: string;
  x: number;
  y: number;
  rotationDeg: number;
  isDestroyed: boolean;
}

export interface ServerMapViewModel {
  players: ServerPlayerViewModel[];
  props: ServerPropViewModel[];
  destroyedPropIds: string[];
}

export interface AppliedServerStateViewModel {
  map: ServerMapViewModel;
  hud: GameHUDViewModel;
  events: GameEvent[];
}

export class ServerStateApplier {
  public constructor(private readonly remoteState: RemoteGameState = new RemoteGameState()) {}

  public getRemoteState(): RemoteGameState {
    return this.remoteState;
  }

  public applyState(
    state: AuthoritativeServerState,
    options: {
      mapManager?: MapManager | null;
      gameHUD?: GameHUD | null;
      localPlayerId?: string | null;
      receivedAtMs?: number;
      nowMs?: number;
    } = {}
  ): AppliedServerStateViewModel {
    this.remoteState.pushState(state, options.receivedAtMs);
    return this.applyCurrentState(options);
  }

  public applyCurrentState(
    options: {
      mapManager?: MapManager | null;
      gameHUD?: GameHUD | null;
      localPlayerId?: string | null;
      nowMs?: number;
    } = {}
  ): AppliedServerStateViewModel {
    const nowMs = options.nowMs ?? Date.now();
    const currentState = this.remoteState.getCurrentState(nowMs);
    const mapViewModel = buildMapViewModel(
      currentState?.players ?? [],
      currentState?.props ?? []
    );
    const hudViewModel = this.remoteState.getHUDViewModel(options.localPlayerId, nowMs);

    if (options.mapManager) {
      applyPropsToMapManager(options.mapManager, mapViewModel.props);
    }

    options.gameHUD?.updateViewModel(hudViewModel);

    return {
      map: mapViewModel,
      hud: hudViewModel,
      events: this.remoteState.getEvents()
    };
  }

  public pushGameEvent(event: GameEvent): void {
    this.remoteState.pushGameEvent(event);
  }
}

function buildMapViewModel(players: PublicPlayerState[], props: PublicPropState[]): ServerMapViewModel {
  const propViewModels = props.map(toPropViewModel);

  return {
    players: players.map(toPlayerViewModel),
    props: propViewModels,
    destroyedPropIds: propViewModels
      .filter((prop) => prop.isDestroyed)
      .map((prop) => prop.propInstanceId)
  };
}

function applyPropsToMapManager(mapManager: MapManager, props: ServerPropViewModel[]): void {
  mapManager.resetDestroyedProps();
  for (const prop of props) {
    if (prop.isDestroyed) {
      mapManager.markPropDestroyed(prop.propInstanceId);
    }
  }
}

function toPlayerViewModel(player: PublicPlayerState): ServerPlayerViewModel {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    role: player.role,
    state: player.state,
    x: player.position.x,
    y: player.position.y,
    facingDeg: player.facingDeg,
    currentPropId: player.currentPropId ?? null,
    score: player.score
  };
}

function toPropViewModel(prop: PublicPropState): ServerPropViewModel {
  return {
    propInstanceId: prop.propInstanceId,
    propConfigId: prop.propConfigId,
    x: prop.position.x,
    y: prop.position.y,
    rotationDeg: prop.rotationDeg,
    isDestroyed: prop.isDestroyed
  };
}
