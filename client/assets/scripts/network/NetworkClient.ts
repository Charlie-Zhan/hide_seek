import type {
  ClientRoomMessage,
  GameEvent,
  GameEventMessage,
  JoinRoomClientMessage,
  PlayerInputMessage,
  ServerRoomMessage,
  ServerStateMessage
} from '@prop-hide-seek/shared';
import { Logger } from '../core/Logger';
import { NetworkConfig, resolveRoomServerUrl } from './NetworkConfig';

export enum NetworkConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnecting = 'disconnecting'
}

export enum NetworkReconnectState {
  Idle = 'idle',
  Waiting = 'waiting',
  Connecting = 'connecting',
  RestoringRoom = 'restoring_room',
  Reconnected = 'reconnected',
  Failed = 'failed'
}

export interface NetworkCloseInfo {
  code?: number;
  reason?: string;
}

export interface NetworkReconnectOptions {
  enabled: boolean;
  delayMs?: number;
  maxAttempts?: number;
  maxElapsedMs?: number;
}

export interface NetworkReconnectInfo {
  state: NetworkReconnectState;
  attempt: number;
  maxAttempts: number;
  nextDelayMs?: number;
  message?: string;
}

export type ClientNetworkMessage = ClientRoomMessage | PlayerInputMessage;
export type ServerNetworkMessage = ServerRoomMessage | ServerStateMessage | GameEventMessage;

type NetworkMessageHandler = (message: ServerNetworkMessage) => void;
type NetworkStateHandler = (state: NetworkConnectionState) => void;
type NetworkReconnectHandler = (info: NetworkReconnectInfo) => void;
type NetworkErrorHandler = (message: string) => void;

interface SocketAdapter {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface BrowserSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: NetworkCloseInfo) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type BrowserSocketConstructor = new (url: string) => BrowserSocketLike;

interface WeChatSocketTask {
  onOpen(callback: () => void): void;
  onMessage(callback: (event: { data: unknown }) => void): void;
  onError(callback: (event: { errMsg?: string }) => void): void;
  onClose(callback: (event: NetworkCloseInfo) => void): void;
  send(options: { data: string; fail?: (error: { errMsg?: string }) => void }): void;
  close(options?: { code?: number; reason?: string }): void;
}

interface WeChatSocketApi {
  connectSocket(options: { url: string }): WeChatSocketTask;
}

export class NetworkClient {
  private readonly logger = new Logger('NetworkClient');
  private readonly messageHandlers = new Set<NetworkMessageHandler>();
  private readonly stateHandlers = new Set<NetworkStateHandler>();
  private readonly reconnectHandlers = new Set<NetworkReconnectHandler>();
  private readonly errorHandlers = new Set<NetworkErrorHandler>();
  private socket: SocketAdapter | null = null;
  private activeSocketToken = 0;
  private connectionState = NetworkConnectionState.Disconnected;
  private reconnectState = NetworkReconnectState.Idle;
  private serverUrl: string = resolveRoomServerUrl();
  private reconnectOptions: NetworkReconnectOptions = {
    enabled: false,
    delayMs: NetworkConfig.reconnectDelayMs,
    maxAttempts: NetworkConfig.reconnectMaxAttempts,
    maxElapsedMs: NetworkConfig.reconnectMaxElapsedMs
  };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectStartedAtMs = 0;
  private roomResumeMessage: JoinRoomClientMessage | null = null;
  private pendingCreateRoomPlayerName: string | null = null;

  public connect(serverUrl = this.serverUrl): void {
    if (
      this.connectionState === NetworkConnectionState.Connecting ||
      this.connectionState === NetworkConnectionState.Connected
    ) {
      return;
    }

    this.serverUrl = serverUrl;
    this.cancelReconnectTimer();
    this.resetReconnectCycle();
    this.openSocket(serverUrl, false);
  }

  public disconnect(code?: number, reason?: string): void {
    this.configureReconnect({ ...this.reconnectOptions, enabled: false });

    if (!this.socket) {
      this.setConnectionState(NetworkConnectionState.Disconnected);
      return;
    }

    const socket = this.socket;
    this.activeSocketToken += 1;
    this.socket = null;
    this.setConnectionState(NetworkConnectionState.Disconnecting);
    socket.close(code, reason);
    this.setConnectionState(NetworkConnectionState.Disconnected);
  }

  public reconnect(): void {
    this.cancelReconnectTimer();
    this.closeSocketForReconnect();
    this.reconnectStartedAtMs = Date.now();
    this.reconnectAttempt = 1;
    this.emitReconnectState(NetworkReconnectState.Connecting, {
      message: 'Network disconnected, reconnecting.'
    });
    this.openSocket(this.serverUrl, true);
  }

  public configureReconnect(options: NetworkReconnectOptions): void {
    this.reconnectOptions = {
      enabled: options.enabled,
      delayMs: options.delayMs ?? NetworkConfig.reconnectDelayMs,
      maxAttempts: options.maxAttempts ?? NetworkConfig.reconnectMaxAttempts,
      maxElapsedMs: options.maxElapsedMs ?? NetworkConfig.reconnectMaxElapsedMs
    };

    if (!this.reconnectOptions.enabled) {
      this.cancelReconnectTimer();
      this.resetReconnectCycle();
    }
  }

  public setRoomResumeTarget(roomId: string, playerName: string): void {
    const cleanRoomId = roomId.trim().toUpperCase();
    const cleanPlayerName = playerName.trim();
    if (cleanRoomId.length === 0 || cleanPlayerName.length === 0) {
      this.roomResumeMessage = null;
      return;
    }

    this.roomResumeMessage = {
      type: 'join_room',
      roomId: cleanRoomId,
      playerName: cleanPlayerName
    };
  }

  public clearRoomResumeTarget(): void {
    this.roomResumeMessage = null;
    this.pendingCreateRoomPlayerName = null;
  }

  public getRoomResumeTarget(): JoinRoomClientMessage | null {
    return this.roomResumeMessage === null ? null : { ...this.roomResumeMessage };
  }

  public send(message: ClientNetworkMessage): boolean {
    if (this.connectionState !== NetworkConnectionState.Connected || !this.socket) {
      this.emitError('Cannot send room message while disconnected.');
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send room message.';
      this.emitError(errorMessage);
      return false;
    }

    this.rememberRoomMessageForResume(message);
    return true;
  }

  public onMessage(handler: NetworkMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onStateChange(handler: NetworkStateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  public onReconnectStateChange(handler: NetworkReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  public onError(handler: NetworkErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  public getConnectionState(): NetworkConnectionState {
    return this.connectionState;
  }

  public getReconnectState(): NetworkReconnectState {
    return this.reconnectState;
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public setServerUrl(serverUrl: string): void {
    this.serverUrl = serverUrl;
  }

  public isConnected(): boolean {
    return this.connectionState === NetworkConnectionState.Connected;
  }

  private openSocket(serverUrl: string, isReconnectAttempt: boolean): void {
    this.setConnectionState(NetworkConnectionState.Connecting);

    try {
      const socketToken = this.activeSocketToken + 1;
      this.activeSocketToken = socketToken;
      this.socket = this.createSocket(serverUrl, socketToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create WebSocket.';
      this.socket = null;
      this.setConnectionState(NetworkConnectionState.Disconnected);
      this.emitError(message);

      if (isReconnectAttempt) {
        this.scheduleReconnect();
      }
    }
  }

  private createSocket(serverUrl: string, socketToken: number): SocketAdapter {
    const wechatApi = getWeChatSocketApi();
    if (wechatApi) {
      return this.createWeChatSocket(serverUrl, wechatApi, socketToken);
    }

    const BrowserSocket = (globalThis as { WebSocket?: BrowserSocketConstructor }).WebSocket;
    if (!BrowserSocket) {
      throw new Error('No WebSocket implementation is available.');
    }

    const socket = new BrowserSocket(serverUrl);
    socket.onopen = () => this.handleOpen(socketToken);
    socket.onmessage = (event) => this.handleMessageData(event.data, socketToken);
    socket.onerror = () => this.handleSocketError('WebSocket error.', socketToken);
    socket.onclose = (event) => this.handleClose(event, socketToken);

    return {
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason)
    };
  }

  private createWeChatSocket(
    serverUrl: string,
    wechatApi: WeChatSocketApi,
    socketToken: number
  ): SocketAdapter {
    const task = wechatApi.connectSocket({ url: serverUrl });
    task.onOpen(() => this.handleOpen(socketToken));
    task.onMessage((event) => this.handleMessageData(event.data, socketToken));
    task.onError((event) => this.handleSocketError(event.errMsg ?? 'WeChat socket error.', socketToken));
    task.onClose((event) => this.handleClose(event, socketToken));

    return {
      send: (data) => {
        task.send({
          data,
          fail: (error) => this.handleSocketError(error.errMsg ?? 'WeChat socket send failed.', socketToken)
        });
      },
      close: (code, reason) => task.close({ code, reason })
    };
  }

  private handleOpen(socketToken: number): void {
    if (!this.isActiveSocket(socketToken)) {
      return;
    }

    this.logger.info('Connected to room server.', { serverUrl: this.serverUrl });
    this.setConnectionState(NetworkConnectionState.Connected);

    if (!this.isReconnectActive()) {
      return;
    }

    if (this.roomResumeMessage) {
      this.emitReconnectState(NetworkReconnectState.RestoringRoom, {
        message: 'Reconnected, restoring room.'
      });
      this.send(this.roomResumeMessage);
      return;
    }

    this.finishReconnect('Reconnected to room server.');
  }

  private handleMessageData(data: unknown, socketToken: number): void {
    if (!this.isActiveSocket(socketToken)) {
      return;
    }

    if (typeof data !== 'string') {
      this.emitError('Ignored non-text room message.');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      this.emitError('Ignored invalid JSON room message.');
      return;
    }

    if (!isServerNetworkMessage(parsed)) {
      this.emitError('Ignored unknown room message.');
      return;
    }

    this.updateResumeTargetFromServer(parsed);
    this.updateReconnectFromServer(parsed);

    for (const handler of this.messageHandlers) {
      handler(parsed);
    }
  }

  private handleSocketError(message: string, socketToken: number): void {
    if (!this.isActiveSocket(socketToken)) {
      return;
    }

    this.logger.warn(message);
    this.emitError(message);
  }

  private handleClose(event: NetworkCloseInfo, socketToken: number): void {
    if (!this.isActiveSocket(socketToken)) {
      return;
    }

    this.socket = null;
    this.logger.info('Disconnected from room server.', event);
    this.setConnectionState(NetworkConnectionState.Disconnected);

    if (this.reconnectOptions.enabled) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.reconnectOptions.enabled || this.reconnectTimer !== null) {
      return;
    }

    const now = Date.now();
    if (this.reconnectStartedAtMs === 0) {
      this.reconnectStartedAtMs = now;
    }

    const maxAttempts = this.getReconnectMaxAttempts();
    const maxElapsedMs = this.getReconnectMaxElapsedMs();
    const nextAttempt = this.reconnectAttempt + 1;
    const elapsedMs = now - this.reconnectStartedAtMs;

    if (nextAttempt > maxAttempts || elapsedMs > maxElapsedMs) {
      this.failReconnect('Reconnect failed.');
      return;
    }

    const delayMs = this.getReconnectDelayMs();
    this.reconnectAttempt = nextAttempt;
    this.emitError('Network disconnected, reconnecting.');
    this.emitReconnectState(NetworkReconnectState.Waiting, {
      nextDelayMs: delayMs,
      message: 'Network disconnected, reconnecting.'
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.reconnectOptions.enabled) {
        return;
      }

      this.emitReconnectState(NetworkReconnectState.Connecting, {
        message: 'Network disconnected, reconnecting.'
      });
      this.openSocket(this.serverUrl, true);
    }, delayMs);
  }

  private failReconnect(message: string): void {
    this.cancelReconnectTimer();
    this.emitReconnectState(NetworkReconnectState.Failed, { message });
    this.emitError(message);
    this.reconnectAttempt = 0;
    this.reconnectStartedAtMs = 0;
  }

  private finishReconnect(message: string): void {
    this.cancelReconnectTimer();
    this.emitReconnectState(NetworkReconnectState.Reconnected, { message });
    this.reconnectAttempt = 0;
    this.reconnectStartedAtMs = 0;
  }

  private updateReconnectFromServer(message: ServerNetworkMessage): void {
    if (!this.isReconnectActive()) {
      return;
    }

    if (message.type === 'room_joined' || message.type === 'room_updated' || message.type === 'match_starting') {
      this.finishReconnect('Room restored after reconnect.');
      return;
    }

    if (message.type !== 'error') {
      return;
    }

    const permanentReconnectCodes = new Set([
      'room_not_found',
      'room_full',
      'match_already_started',
      'invalid_player_name'
    ]);

    if (permanentReconnectCodes.has(message.code)) {
      this.clearRoomResumeTarget();
      this.failReconnect('Reconnect failed.');
    }
  }

  private rememberRoomMessageForResume(message: ClientNetworkMessage): void {
    switch (message.type) {
      case 'join_room':
        this.setRoomResumeTarget(message.roomId, message.playerName);
        return;
      case 'create_room':
        this.pendingCreateRoomPlayerName = message.playerName;
        return;
      case 'leave_room':
        this.clearRoomResumeTarget();
        return;
      case 'set_ready':
      case 'start_match':
      case 'player_input':
        return;
      default:
        exhaustiveClientMessage(message);
    }
  }

  private updateResumeTargetFromServer(message: ServerNetworkMessage): void {
    if (message.type !== 'room_joined') {
      return;
    }

    const playerId = getOptionalServerPlayerId(message);
    const localPlayer = playerId
      ? message.room.players.find((player) => player.playerId === playerId)
      : undefined;
    const playerName =
      localPlayer?.playerName ??
      localPlayer?.displayName ??
      this.roomResumeMessage?.playerName ??
      this.pendingCreateRoomPlayerName;

    if (playerName) {
      this.setRoomResumeTarget(message.room.roomId, playerName);
    }
  }

  private closeSocketForReconnect(): void {
    if (!this.socket) {
      this.setConnectionState(NetworkConnectionState.Disconnected);
      return;
    }

    const socket = this.socket;
    this.activeSocketToken += 1;
    this.socket = null;
    socket.close();
    this.setConnectionState(NetworkConnectionState.Disconnected);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private resetReconnectCycle(): void {
    this.reconnectAttempt = 0;
    this.reconnectStartedAtMs = 0;
    if (this.reconnectState !== NetworkReconnectState.Idle) {
      this.emitReconnectState(NetworkReconnectState.Idle);
    }
  }

  private isReconnectActive(): boolean {
    return this.reconnectState === NetworkReconnectState.Waiting ||
      this.reconnectState === NetworkReconnectState.Connecting ||
      this.reconnectState === NetworkReconnectState.RestoringRoom;
  }

  private isActiveSocket(socketToken: number): boolean {
    return socketToken === this.activeSocketToken;
  }

  private getReconnectDelayMs(): number {
    return Math.max(0, this.reconnectOptions.delayMs ?? NetworkConfig.reconnectDelayMs);
  }

  private getReconnectMaxAttempts(): number {
    return Math.max(1, Math.floor(this.reconnectOptions.maxAttempts ?? NetworkConfig.reconnectMaxAttempts));
  }

  private getReconnectMaxElapsedMs(): number {
    return Math.max(1, this.reconnectOptions.maxElapsedMs ?? NetworkConfig.reconnectMaxElapsedMs);
  }

  private setConnectionState(state: NetworkConnectionState): void {
    if (this.connectionState === state) {
      return;
    }

    this.connectionState = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  private emitReconnectState(
    state: NetworkReconnectState,
    extra: Partial<Omit<NetworkReconnectInfo, 'state' | 'attempt' | 'maxAttempts'>> = {}
  ): void {
    this.reconnectState = state;
    const info: NetworkReconnectInfo = {
      state,
      attempt: this.reconnectAttempt,
      maxAttempts: this.getReconnectMaxAttempts(),
      ...extra
    };

    for (const handler of this.reconnectHandlers) {
      handler(info);
    }
  }

  private emitError(message: string): void {
    for (const handler of this.errorHandlers) {
      handler(message);
    }
  }
}

export const roomNetworkClient = new NetworkClient();

function getOptionalServerPlayerId(message: ServerNetworkMessage): string | null {
  const maybePlayerId = (message as { playerId?: unknown }).playerId;
  return typeof maybePlayerId === 'string' && maybePlayerId.trim().length > 0 ? maybePlayerId : null;
}

function getWeChatSocketApi(): WeChatSocketApi | null {
  const maybeGlobal = globalThis as { wx?: Partial<WeChatSocketApi> };
  return typeof maybeGlobal.wx?.connectSocket === 'function'
    ? (maybeGlobal.wx as WeChatSocketApi)
    : null;
}

function isServerNetworkMessage(value: unknown): value is ServerNetworkMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'room_joined':
    case 'room_updated':
    case 'match_starting':
      return isRecord(value.room) && typeof value.room.roomId === 'string' && Array.isArray(value.room.players);
    case 'state':
      return isServerStateMessage(value);
    case 'game_event':
      return isGameEventMessage(value);
    case 'error':
      return typeof value.code === 'string' && typeof value.message === 'string';
    default:
      return false;
  }
}

function isServerStateMessage(value: unknown): value is ServerStateMessage {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.serverTick === 'number' &&
    typeof value.serverTimeMs === 'number' &&
    typeof value.roomId === 'string' &&
    typeof value.phase === 'string' &&
    typeof value.timeLeftMs === 'number' &&
    Array.isArray(value.players) &&
    value.players.every(isPublicPlayerState) &&
    Array.isArray(value.props) &&
    value.props.every(isPublicPropState) &&
    Array.isArray(value.events) &&
    value.events.every(isGameEvent) &&
    isRecord(value.scores);
}

function isGameEventMessage(value: unknown): value is GameEventMessage {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.serverTimeMs === 'number' && isGameEvent(value.event);
}

function isPublicPlayerState(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.playerId === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.role === 'string' &&
    typeof value.state === 'string' &&
    isVector2(value.position) &&
    typeof value.facingDeg === 'number' &&
    typeof value.score === 'number';
}

function isPublicPropState(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.propInstanceId === 'string' &&
    typeof value.propConfigId === 'string' &&
    isVector2(value.position) &&
    typeof value.rotationDeg === 'number' &&
    typeof value.isDestroyed === 'boolean';
}

function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.serverTimeMs === 'number';
}

function isVector2(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.x === 'number' && typeof value.y === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function exhaustiveClientMessage(value: never): never {
  throw new Error(`Unhandled client message: ${JSON.stringify(value)}`);
}
