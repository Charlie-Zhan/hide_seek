import { _decorator, Component } from 'cc';
import type { ClientRoomMessage } from '@prop-hide-seek/shared';
import { SceneName } from '../core/GameConstants';
import { Logger } from '../core/Logger';
import { SceneLoader } from '../core/SceneLoader';
import {
  MAX_SOLO_COMPUTER_COUNT,
  MIN_SOLO_COMPUTER_COUNT,
  sessionState
} from '../core/SessionState';
import { MessageRouter } from '../network/MessageRouter';
import { normalizeRoomServerUrl, saveRoomServerUrl } from '../network/NetworkConfig';
import {
  NetworkConnectionState,
  roomNetworkClient
} from '../network/NetworkClient';
import { weChatPlatform, type WeChatLaunchOptions } from '../wechat/WeChatPlatform';

const { ccclass } = _decorator;

export interface LobbyDisplayState {
  titleText: string;
  subtitleText: string;
  playerNameLabelText: string;
  playerNameText: string;
  joinRoomIdLabelText: string;
  joinRoomIdText: string;
  serverUrlLabelText: string;
  serverUrlText: string;
  gameplayEntryText: string;
  gameplaySummaryLines: string[];
  connectionStatusText: string;
  errorText: string;
  createButtonText: string;
  joinButtonText: string;
  soloButtonText: string;
  soloComputerCountText: string;
  canDecreaseSoloComputerCount: boolean;
  canIncreaseSoloComputerCount: boolean;
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
  private stopLaunchOptions: (() => void) | null = null;
  private playerName = sessionState.getPlayerName();
  private joinRoomId = '';
  private serverUrl = roomNetworkClient.getServerUrl();
  private connectionStatus = roomNetworkClient.getConnectionState();
  private errorText = '';
  private pendingMessage: ClientRoomMessage | null = null;
  private soloComputerCount = sessionState.getSoloComputerCount();

  protected override start(): void {
    this.router.start();
    this.stopConnectionState = roomNetworkClient.onStateChange((state) => {
      this.setConnectionStatus(state);
      this.flushPendingMessage();
    });
    this.stopNetworkError = roomNetworkClient.onError((message) => this.setError(message));
    this.applyLaunchOptions();
    this.stopLaunchOptions = weChatPlatform.onShowLaunchOptions((options) => {
      this.applyLaunchOptions(options);
    });
  }

  protected onDestroy(): void {
    this.router.stop();
    this.stopConnectionState?.();
    this.stopNetworkError?.();
    this.stopLaunchOptions?.();
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

  public setServerUrl(serverUrl: string): boolean {
    const normalizedUrl = normalizeRoomServerUrl(serverUrl);
    if (!normalizedUrl) {
      this.setError('Server URL must start with ws:// or wss://.');
      return false;
    }
    if (isLikelyTruncatedDevToolsUrl(normalizedUrl, this.serverUrl)) {
      this.setError(`Ignored truncated server URL. Using ${this.serverUrl}`);
      return true;
    }

    this.serverUrl = normalizedUrl;
    saveRoomServerUrl(normalizedUrl);
    if (roomNetworkClient.getServerUrl() !== normalizedUrl) {
      roomNetworkClient.disconnect();
      roomNetworkClient.setServerUrl(normalizedUrl);
    }
    this.errorText = '';
    return true;
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

  public applyLaunchServerUrl(serverUrl: string | null): boolean {
    if (!serverUrl) {
      return false;
    }

    return this.setServerUrl(serverUrl);
  }

  public applyLaunchOptions(options?: WeChatLaunchOptions | null): boolean {
    const serverApplied = this.applyLaunchServerUrl(weChatPlatform.getLaunchServerUrl(options));
    const roomApplied = this.applyLaunchRoomId(weChatPlatform.getLaunchRoomId(options));
    return serverApplied || roomApplied;
  }

  public setConnectionStatus(status: NetworkConnectionState | string): void {
    this.connectionStatus = normalizeConnectionStatus(status);
  }

  public createRoom(): void {
    const playerName = this.getValidatedPlayerName();
    if (!playerName) {
      return;
    }

    sessionState.startMultiplayerMode();
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

    sessionState.startMultiplayerMode();
    this.queueOrSend({
      type: 'join_room',
      roomId,
      playerName
    });
  }

  public startSoloMode(): void {
    const playerName = this.playerName.trim() || 'Solo Player';
    this.playerName = playerName;
    sessionState.startSoloMode(playerName, 'solo_player_1', this.soloComputerCount);
    this.errorText = '';
    this.sceneLoader.load(SceneName.Game);
  }

  public setSoloComputerCount(count: number): void {
    sessionState.setSoloComputerCount(count);
    this.soloComputerCount = sessionState.getSoloComputerCount();
    this.errorText = '';
  }

  public adjustSoloComputerCount(delta: number): void {
    this.setSoloComputerCount(this.soloComputerCount + delta);
  }

  public getDisplayState(): LobbyDisplayState {
    return {
      titleText: 'Prop Hide & Seek',
      subtitleText: 'Memorize the room. Hide as a prop. Spend attacks carefully.',
      playerNameLabelText: 'Player Name',
      playerNameText: this.playerName,
      joinRoomIdLabelText: 'Room Code',
      joinRoomIdText: this.joinRoomId,
      serverUrlLabelText: 'Server',
      serverUrlText: this.serverUrl,
      gameplayEntryText: 'How to Play',
      gameplaySummaryLines: [
        'Preview: study the original prop layout.',
        'Hiders: move, stop, and blend in as props.',
        'Seeker: use limited cone attacks to find hiders.'
      ],
      connectionStatusText: connectionStateToText(this.connectionStatus),
      errorText: this.errorText,
      createButtonText: 'Create Room',
      joinButtonText: 'Join Room',
      soloButtonText: 'Solo Practice',
      soloComputerCountText: `${this.soloComputerCount} Computer ${this.soloComputerCount === 1 ? 'Player' : 'Players'}`,
      canDecreaseSoloComputerCount: this.soloComputerCount > MIN_SOLO_COMPUTER_COUNT,
      canIncreaseSoloComputerCount: this.soloComputerCount < MAX_SOLO_COMPUTER_COUNT
    };
  }

  private queueOrSend(message: ClientRoomMessage): void {
    this.pendingMessage = message;
    this.errorText = '';

    if (roomNetworkClient.isConnected()) {
      this.flushPendingMessage();
      return;
    }

    roomNetworkClient.connect(this.serverUrl);
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

function isLikelyTruncatedDevToolsUrl(nextUrl: string, currentUrl: string): boolean {
  if (nextUrl === currentUrl || !currentUrl.startsWith('ws://')) {
    return false;
  }

  return currentUrl.startsWith(nextUrl.replace(/\/$/, '')) && nextUrl.length < currentUrl.length;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled connection state: ${value}`);
}
