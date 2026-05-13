import { _decorator, Component } from 'cc';
import type { ClientRoomMessage } from '@prop-hide-seek/shared';
import { SceneName } from '../core/GameConstants';
import { Logger } from '../core/Logger';
import { SceneLoader } from '../core/SceneLoader';
import { sessionState } from '../core/SessionState';
import { MessageRouter } from '../network/MessageRouter';
import {
  NetworkConnectionState,
  roomNetworkClient
} from '../network/NetworkClient';
import { weChatPlatform } from '../wechat/WeChatPlatform';

const { ccclass } = _decorator;

export interface LobbyDisplayState {
  titleText: string;
  subtitleText: string;
  playerNameLabelText: string;
  playerNameText: string;
  joinRoomIdLabelText: string;
  joinRoomIdText: string;
  gameplayEntryText: string;
  gameplaySummaryLines: string[];
  connectionStatusText: string;
  errorText: string;
  createButtonText: string;
  joinButtonText: string;
}

@ccclass('LobbyUI')
export class LobbyUI extends Component {
  private readonly logger = new Logger('LobbyUI');
  private readonly sceneLoader = new SceneLoader();
  private readonly router = new MessageRouter(roomNetworkClient, {
    onRoomJoined: () => this.enterRoomScene(),
    onError: (message) => this.setError(message.message)
  });
  private stopConnectionState: (() => void) | null = null;
  private stopNetworkError: (() => void) | null = null;
  private playerName = sessionState.getPlayerName();
  private joinRoomId = '';
  private connectionStatus = roomNetworkClient.getConnectionState();
  private errorText = '';
  private pendingMessage: ClientRoomMessage | null = null;

  protected override start(): void {
    this.router.start();
    this.stopConnectionState = roomNetworkClient.onStateChange((state) => {
      this.setConnectionStatus(state);
      this.flushPendingMessage();
    });
    this.stopNetworkError = roomNetworkClient.onError((message) => this.setError(message));
    this.applyLaunchRoomId(weChatPlatform.getLaunchRoomId());
  }

  protected onDestroy(): void {
    this.router.stop();
    this.stopConnectionState?.();
    this.stopNetworkError?.();
  }

  public setPlayerName(playerName: string): void {
    this.playerName = playerName.trim();
    sessionState.setPlayerName(this.playerName);
    this.errorText = '';
  }

  public setJoinRoomId(roomId: string): void {
    this.joinRoomId = roomId.trim().toUpperCase();
    this.errorText = '';
  }

  public applyLaunchRoomId(roomId: string | null): boolean {
    if (!roomId) {
      return false;
    }

    this.setJoinRoomId(roomId);
    const playerName = this.resolveLaunchPlayerIdentity();
    this.queueOrSend({
      type: 'join_room',
      roomId: this.joinRoomId,
      playerName
    });
    return true;
  }

  public setConnectionStatus(status: NetworkConnectionState | string): void {
    this.connectionStatus = normalizeConnectionStatus(status);
  }

  public createRoom(): void {
    const playerName = this.getValidatedPlayerName();
    if (!playerName) {
      return;
    }

    this.queueOrSend({
      type: 'create_room',
      playerName
    });
  }

  public joinRoom(): void {
    const playerName = this.getValidatedPlayerName();
    if (!playerName) {
      return;
    }

    const roomId = this.joinRoomId.trim().toUpperCase();
    if (roomId.length === 0) {
      this.setError('Room code is required.');
      return;
    }

    this.queueOrSend({
      type: 'join_room',
      roomId,
      playerName
    });
  }

  public getDisplayState(): LobbyDisplayState {
    return {
      titleText: 'Prop Hide & Seek',
      subtitleText: 'Memorize the room. Hide as a prop. Spend attacks carefully.',
      playerNameLabelText: 'Player Name',
      playerNameText: this.playerName,
      joinRoomIdLabelText: 'Room Code',
      joinRoomIdText: this.joinRoomId,
      gameplayEntryText: 'How to Play',
      gameplaySummaryLines: [
        'Preview: study the original prop layout.',
        'Hiders: move, stop, and blend in as props.',
        'Seeker: use limited cone attacks to find hiders.'
      ],
      connectionStatusText: connectionStateToText(this.connectionStatus),
      errorText: this.errorText,
      createButtonText: 'Create Room',
      joinButtonText: 'Join Room'
    };
  }

  private queueOrSend(message: ClientRoomMessage): void {
    this.pendingMessage = message;
    this.errorText = '';

    if (roomNetworkClient.isConnected()) {
      this.flushPendingMessage();
      return;
    }

    roomNetworkClient.connect();
    this.setConnectionStatus(NetworkConnectionState.Connecting);
  }

  private flushPendingMessage(): void {
    if (!this.pendingMessage || !roomNetworkClient.isConnected()) {
      return;
    }

    const message = this.pendingMessage;
    this.pendingMessage = null;

    if (!roomNetworkClient.send(message)) {
      this.pendingMessage = message;
    }
  }

  private getValidatedPlayerName(): string | null {
    const playerName = this.playerName.trim();
    if (playerName.length === 0) {
      this.setError('Player name is required.');
      return null;
    }

    sessionState.setPlayerName(playerName);
    return playerName;
  }

  private resolveLaunchPlayerIdentity(): string {
    const currentPlayerName = this.playerName.trim();
    const profile = weChatPlatform.getOrCreatePlayerProfile(currentPlayerName || null);
    const playerName = currentPlayerName || profile.nickname;

    this.playerName = playerName;
    sessionState.setPlayerId(profile.playerId);
    sessionState.setPlayerName(playerName);
    return playerName;
  }

  private enterRoomScene(): void {
    this.logger.info('Room joined; loading Room scene.', sessionState.getSnapshot());
    this.sceneLoader.load(SceneName.Room);
  }

  private setError(message: string): void {
    this.errorText = message;
  }
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
