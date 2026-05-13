import { _decorator, Component } from 'cc';
import type { PublicRoomPlayer, PublicRoomState } from '@prop-hide-seek/shared';
import { SceneName } from '../core/GameConstants';
import { Logger } from '../core/Logger';
import { SceneLoader } from '../core/SceneLoader';
import { sessionState } from '../core/SessionState';
import { MessageRouter } from '../network/MessageRouter';
import {
  NetworkConnectionState,
  roomNetworkClient
} from '../network/NetworkClient';

const { ccclass } = _decorator;

export interface RoomPlayerDisplayState {
  playerId: string;
  nameText: string;
  readyText: string;
  connectionText: string;
  ownerText: string;
}

export interface RoomDisplayState {
  titleText: string;
  roomCodeLabelText: string;
  roomCodeText: string;
  playerCountText: string;
  readinessSummaryText: string;
  playerList: RoomPlayerDisplayState[];
  readyButtonText: string;
  startButtonText: string;
  shareButtonText: string;
  backButtonText: string;
  connectionStatusText: string;
  networkStatusText: string;
  errorText: string;
  canStart: boolean;
  canSetReady: boolean;
  canShare: boolean;
}

@ccclass('RoomUI')
export class RoomUI extends Component {
  private readonly logger = new Logger('RoomUI');
  private readonly sceneLoader = new SceneLoader();
  private readonly router = new MessageRouter(roomNetworkClient, {
    onRoomJoined: (message) => this.updateRoom(message.room),
    onRoomUpdated: (message) => this.updateRoom(message.room),
    onMatchStarting: (message) => this.updateRoom(message.room),
    onLoadGameScene: () => this.loadGameScene(),
    onError: (message) => this.setError(message.message)
  });
  private stopConnectionState: (() => void) | null = null;
  private stopNetworkError: (() => void) | null = null;
  private room: PublicRoomState | null = sessionState.getLatestRoom();
  private connectionStatus = roomNetworkClient.getConnectionState();
  private errorText = '';

  protected override start(): void {
    this.router.start();
    this.stopConnectionState = roomNetworkClient.onStateChange((state) => this.setConnectionStatus(state));
    this.stopNetworkError = roomNetworkClient.onError((message) => this.setError(message));
  }

  protected onDestroy(): void {
    this.router.stop();
    this.stopConnectionState?.();
    this.stopNetworkError?.();
  }

  public updateRoom(room: PublicRoomState): void {
    this.room = cloneRoom(room);
    sessionState.setRoom(room);
    this.errorText = '';
  }

  public setReady(ready: boolean): void {
    this.sendRoomMessage({
      type: 'set_ready',
      ready
    });
  }

  public startMatch(): void {
    this.sendRoomMessage({
      type: 'start_match'
    });
  }

  public leaveRoom(): void {
    this.sendRoomMessage({
      type: 'leave_room'
    });
    sessionState.clearRoom();
    this.room = null;
    this.sceneLoader.load(SceneName.Lobby);
  }

  public setConnectionStatus(status: NetworkConnectionState | string): void {
    this.connectionStatus = normalizeConnectionStatus(status);
  }

  public getDisplayState(): RoomDisplayState {
    const localPlayer = sessionState.getLocalRoomPlayer();
    const canStart = this.canStart(localPlayer);
    const players = this.room?.players ?? [];
    const connectedPlayers = players.filter((player) => player.connected);
    const readyPlayers = connectedPlayers.filter((player) => player.ready);

    return {
      titleText: 'Room',
      roomCodeLabelText: 'Room Code',
      roomCodeText: this.room?.roomId ?? '',
      playerCountText: this.room
        ? `${connectedPlayers.length}/${this.room.maxPlayers} Players`
        : '0/0 Players',
      readinessSummaryText: this.room
        ? `${readyPlayers.length}/${Math.max(connectedPlayers.length, this.room.minPlayers)} Ready`
        : 'Waiting for room',
      playerList: players.map((player) => buildPlayerDisplayState(player)),
      readyButtonText: localPlayer?.ready ? 'Cancel Ready' : 'Ready',
      startButtonText: 'Start',
      shareButtonText: 'Share',
      backButtonText: 'Back',
      connectionStatusText: connectionStateToText(this.connectionStatus),
      networkStatusText: `Network: ${connectionStateToText(this.connectionStatus)}`,
      errorText: this.errorText,
      canStart,
      canSetReady: Boolean(localPlayer) && this.room?.status === 'waiting',
      canShare: Boolean(this.room?.roomId)
    };
  }

  private sendRoomMessage(message: Parameters<typeof roomNetworkClient.send>[0]): void {
    if (!roomNetworkClient.send(message)) {
      this.setError('Not connected to room server.');
    }
  }

  private canStart(localPlayer: PublicRoomPlayer | null): boolean {
    if (!this.room || this.room.status !== 'waiting' || !localPlayer?.isOwner) {
      return false;
    }

    const connectedPlayers = this.room.players.filter((player) => player.connected);
    const readyPlayers = connectedPlayers.filter((player) => player.ready);
    return connectedPlayers.length >= this.room.minPlayers && readyPlayers.length === connectedPlayers.length;
  }

  private loadGameScene(): void {
    this.logger.info('Match starting; loading Game scene.', sessionState.getSnapshot());
    this.sceneLoader.load(SceneName.Game);
  }

  private setError(message: string): void {
    this.errorText = message;
  }
}

function buildPlayerDisplayState(player: PublicRoomPlayer): RoomPlayerDisplayState {
  return {
    playerId: player.playerId,
    nameText: player.displayName || player.playerName,
    readyText: player.ready ? 'Ready' : 'Not Ready',
    connectionText: player.connected ? 'Connected' : 'Disconnected',
    ownerText: player.isOwner ? 'Owner' : ''
  };
}

function cloneRoom(room: PublicRoomState): PublicRoomState {
  return {
    ...room,
    players: room.players.map((player) => ({ ...player }))
  };
}

function normalizeConnectionStatus(status: NetworkConnectionState | string): NetworkConnectionState {
  if (Object.values(NetworkConnectionState).includes(status as NetworkConnectionState)) {
    return status as NetworkConnectionState;
  }

  return NetworkConnectionState.Disconnected;
}

function connectionStateToText(status: NetworkConnectionState): string {
  switch (status) {
    case NetworkConnectionState.Connected:
      return 'Connected';
    case NetworkConnectionState.Connecting:
      return 'Connecting';
    case NetworkConnectionState.Disconnecting:
      return 'Disconnecting';
    case NetworkConnectionState.Disconnected:
      return 'Disconnected';
    default:
      return exhaustive(status);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled connection state: ${value}`);
}
