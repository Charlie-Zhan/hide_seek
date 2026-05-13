import { WebSocket, WebSocketServer } from 'ws';
import { serverConfig } from '../config/ServerConfig.js';
import { AuthoritativeMatch, RoundPhase, redactSnapshotForPlayer, type GameConfig, type MatchSnapshot, type PlayerInputAction } from '../game/index.js';
import { Logger } from '../util/Logger.js';
import { RoomService, type PublicRoomState, type RoomServiceError } from '../rooms/RoomService.js';

type ClientRoomMessage =
  | { type: 'create_room'; requestId?: string; playerName: string }
  | { type: 'join_room'; requestId?: string; roomId: string; playerName: string }
  | { type: 'leave_room'; requestId?: string }
  | { type: 'set_ready'; requestId?: string; ready: boolean }
  | { type: 'start_match'; requestId?: string }
  | { type: 'player_input'; requestId?: string; seq?: number; moveX: number; moveY: number; action?: PlayerInputAction }
  | { type: 'player_ready'; requestId?: string; isReady: boolean };

type ServerRoomMessage =
  | { type: 'welcome'; requestId?: string; serverTimeMs: number; playerId: string }
  | { type: 'room_joined'; requestId?: string; serverTimeMs: number; playerId: string; room: PublicRoomState }
  | { type: 'room_updated'; requestId?: string; serverTimeMs: number; room: PublicRoomState }
  | { type: 'match_starting'; requestId?: string; serverTimeMs: number; room: PublicRoomState }
  | (MatchSnapshot & { requestId?: string; serverTimeMs: number })
  | { type: 'error'; requestId?: string; serverTimeMs: number; code: string; message: string };

interface RoomClient {
  readonly playerId: string;
  readonly socket: WebSocket;
}

export interface WebSocketRoomServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly tickRateHz?: number;
  readonly matchConfig?: Partial<GameConfig>;
}

interface ActiveMatch {
  readonly match: AuthoritativeMatch;
  readonly timer: ReturnType<typeof setInterval>;
  readonly tickIntervalMs: number;
}

export class WebSocketRoomServer {
  private readonly logger = new Logger('WebSocketRoomServer');
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, RoomClient>();
  private readonly activeMatches = new Map<string, ActiveMatch>();
  private readonly tickRateHz: number;
  private readonly matchConfig?: Partial<GameConfig>;
  private nextPlayerId = 1;

  public constructor(
    private readonly roomService: RoomService,
    options: WebSocketRoomServerOptions = {}
  ) {
    this.tickRateHz = options.tickRateHz ?? 12;
    this.matchConfig = options.matchConfig;
    this.wss = new WebSocketServer({
      host: options.host ?? serverConfig.host,
      port: options.port ?? serverConfig.port,
    });
  }

  public start(): void {
    this.wss.on('connection', (socket, request) => {
      const playerId = this.allocatePlayerId();
      this.clients.set(socket, {
        playerId,
        socket,
      });

      this.logger.info('Client connected.', {
        playerId,
        remoteAddress: request.socket.remoteAddress,
      });

      this.send(socket, {
        type: 'welcome',
        serverTimeMs: Date.now(),
        playerId,
      });

      socket.on('message', (data) => {
        this.handleRawMessage(socket, data);
      });

      socket.on('close', () => {
        this.handleClose(socket);
      });

      socket.on('error', (error) => {
        this.logger.warn('Client socket error.', {
          playerId,
          message: error.message,
        });
      });
    });

    this.wss.on('listening', () => {
      const address = this.wss.address();
      this.logger.info('WebSocket room server listening.', {
        address,
        minPlayers: serverConfig.minPlayers,
        maxPlayers: serverConfig.maxPlayers,
      });
    });

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error.', {
        message: error.message,
      });
    });
  }

  public close(): void {
    for (const roomId of this.activeMatches.keys()) {
      this.stopMatchTicker(roomId);
    }

    this.wss.close();
  }

  public getUrl(): string {
    const address = this.wss.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('WebSocket room server is not listening.');
    }

    return `ws://${serverConfig.host}:${address.port}`;
  }

  public waitUntilListening(): Promise<void> {
    if (this.wss.address() !== null) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.wss.once('listening', resolve);
      this.wss.once('error', reject);
    });
  }

  private handleRawMessage(socket: WebSocket, data: WebSocket.RawData): void {
    const client = this.clients.get(socket);
    if (client === undefined) {
      return;
    }

    const message = parseClientMessage(data);
    if (message === undefined) {
      this.sendError(socket, {
        code: 'invalid_message',
        message: 'Message must be valid JSON with a supported room message type.',
      });
      return;
    }

    this.handleMessage(socket, client, message);
  }

  private handleMessage(socket: WebSocket, client: RoomClient, message: ClientRoomMessage): void {
    switch (message.type) {
      case 'create_room': {
        const result = this.roomService.createRoom(client.playerId, message.playerName);
        if (!result.ok) {
          this.sendError(socket, result.error, message.requestId);
          return;
        }

        this.logger.info('Room created.', {
          roomId: result.value.roomId,
          playerId: client.playerId,
        });
        this.send(socket, roomJoinedMessage(client.playerId, result.value, message.requestId));
        this.broadcastRoomUpdate(result.value);
        return;
      }

      case 'join_room': {
        const result = this.roomService.joinRoom(message.roomId, client.playerId, message.playerName);
        if (!result.ok) {
          this.sendError(socket, result.error, message.requestId);
          return;
        }

        this.logger.info('Player joined room.', {
          roomId: result.value.roomId,
          playerId: client.playerId,
        });
        this.send(socket, roomJoinedMessage(client.playerId, result.value, message.requestId));
        this.broadcastRoomUpdate(result.value);
        return;
      }

      case 'leave_room': {
        const result = this.roomService.leaveRoom(client.playerId);
        if (!result.ok) {
          this.sendError(socket, result.error, message.requestId);
          return;
        }

        this.logger.info('Player left room.', {
          roomId: result.value.roomId,
          playerId: client.playerId,
          roomDeleted: result.value.roomDeleted,
        });

        if (result.value.room !== undefined) {
          this.broadcastRoomUpdate(result.value.room);
        }
        return;
      }

      case 'set_ready':
      case 'player_ready': {
        const ready = message.type === 'set_ready' ? message.ready : message.isReady;
        const result = this.roomService.setReady(client.playerId, ready);
        if (!result.ok) {
          this.sendError(socket, result.error, message.requestId);
          return;
        }

        this.broadcastRoomUpdate(result.value);
        return;
      }

      case 'start_match': {
        const result = this.roomService.startMatch(client.playerId);
        if (!result.ok) {
          this.sendError(socket, result.error, message.requestId);
          return;
        }

        this.logger.info('Match starting.', {
          roomId: result.value.roomId,
          playerCount: result.value.players.length,
        });
        const match = new AuthoritativeMatch({
          roomId: result.value.roomId,
          mapId: result.value.mapId,
          players: result.value.players.map((player) => ({
            playerId: player.playerId,
            displayName: player.displayName,
          })),
          config: this.matchConfig,
        });
        this.startMatchTicker(result.value.roomId, match);
        this.broadcastToRoom(result.value, {
          type: 'match_starting',
          requestId: message.requestId,
          serverTimeMs: Date.now(),
          room: result.value,
        });
        this.broadcastMatchState(result.value, match.getSnapshot(true));
        return;
      }

      case 'player_input': {
        const roomId = this.roomService.getRoomIdForPlayer(client.playerId);
        if (roomId === undefined) {
          this.sendError(socket, {
            code: 'not_in_room',
            message: 'Player is not in a room.',
          }, message.requestId);
          return;
        }

        const activeMatch = this.activeMatches.get(roomId);
        if (activeMatch === undefined) {
          return;
        }

        activeMatch.match.handleInput(client.playerId, {
          seq: message.seq,
          moveX: message.moveX,
          moveY: message.moveY,
          action: message.action,
        });
        return;
      }
    }
  }

  private handleClose(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (client === undefined) {
      return;
    }

    const roomId = this.roomService.getRoomIdForPlayer(client.playerId);
    this.clients.delete(socket);
    const result = this.roomService.disconnectPlayer(client.playerId);
    if (result.ok) {
      this.logger.info('Client disconnected and was removed from waiting room.', {
        playerId: client.playerId,
        roomId: result.value.roomId,
        roomDeleted: result.value.roomDeleted,
      });

      if (result.value.room !== undefined) {
        this.broadcastRoomUpdate(result.value.room);
      }
      return;
    }

    if (roomId !== undefined && !this.hasConnectedClientInRoom(roomId)) {
      this.stopMatchTicker(roomId);
    }

    if (roomId !== undefined) {
      const activeMatch = this.activeMatches.get(roomId);
      const room = this.roomService.getRoom(roomId);
      if (activeMatch !== undefined && room !== undefined) {
        activeMatch.match.handlePlayerDisconnected(client.playerId);
        this.broadcastMatchState(room, activeMatch.match.getSnapshot(true));
      }
    }

    if (result.error.code !== 'not_in_room' && result.error.code !== 'match_already_started') {
      this.logger.warn('Client disconnected without waiting-room removal.', {
        playerId: client.playerId,
        code: result.error.code,
      });
    }
  }

  private broadcastRoomUpdate(room: PublicRoomState): void {
    this.broadcastToRoom(room, {
      type: 'room_updated',
      serverTimeMs: Date.now(),
      room,
    });
  }

  private startMatchTicker(roomId: string, match: AuthoritativeMatch): void {
    this.stopMatchTicker(roomId);

    const tickIntervalMs = Math.max(66, Math.round(1000 / this.tickRateHz));
    const timer = setInterval(() => {
      this.tickMatch(roomId);
    }, tickIntervalMs);

    this.activeMatches.set(roomId, {
      match,
      timer,
      tickIntervalMs,
    });
  }

  private tickMatch(roomId: string): void {
    const activeMatch = this.activeMatches.get(roomId);
    if (activeMatch === undefined) {
      return;
    }

    const room = this.roomService.getRoom(roomId);
    if (room === undefined) {
      this.stopMatchTicker(roomId);
      return;
    }

    const snapshot = activeMatch.match.tick(activeMatch.tickIntervalMs);
    this.broadcastMatchState(room, snapshot);

    if (snapshot.phase !== RoundPhase.MatchEnd) {
      return;
    }

    this.stopMatchTicker(roomId);
    const finished = this.roomService.finishMatch(roomId);
    if (finished.ok) {
      this.broadcastRoomUpdate(finished.value);
    }
  }

  private stopMatchTicker(roomId: string): void {
    const activeMatch = this.activeMatches.get(roomId);
    if (activeMatch === undefined) {
      return;
    }

    clearInterval(activeMatch.timer);
    this.activeMatches.delete(roomId);
  }

  private broadcastMatchState(room: PublicRoomState, snapshot: MatchSnapshot): void {
    const roomPlayerIds = new Set(room.players.map((player) => player.playerId));
    const serverTimeMs = Date.now();
    for (const client of this.clients.values()) {
      if (!roomPlayerIds.has(client.playerId)) {
        continue;
      }

      this.send(client.socket, {
        ...redactSnapshotForPlayer(snapshot, client.playerId),
        serverTimeMs,
      });
    }
  }

  private broadcastToRoom(room: PublicRoomState, message: ServerRoomMessage): void {
    const roomPlayerIds = new Set(room.players.map((player) => player.playerId));
    for (const client of this.clients.values()) {
      if (roomPlayerIds.has(client.playerId)) {
        this.send(client.socket, message);
      }
    }
  }

  private sendError(socket: WebSocket, error: RoomServiceError, requestId?: string): void {
    this.send(socket, {
      type: 'error',
      requestId,
      serverTimeMs: Date.now(),
      code: error.code,
      message: error.message,
    });
  }

  private send(socket: WebSocket, message: ServerRoomMessage): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  }

  private hasConnectedClientInRoom(roomId: string): boolean {
    const room = this.roomService.getRoom(roomId);
    if (room === undefined) {
      return false;
    }

    const roomPlayerIds = new Set(room.players.map((player) => player.playerId));
    for (const client of this.clients.values()) {
      if (roomPlayerIds.has(client.playerId)) {
        return true;
      }
    }

    return false;
  }

  private allocatePlayerId(): string {
    const playerId = `player_${this.nextPlayerId}`;
    this.nextPlayerId += 1;
    return playerId;
  }
}

function parseClientMessage(data: WebSocket.RawData): ClientRoomMessage | undefined {
  let value: unknown;

  try {
    value = JSON.parse(data.toString());
  } catch {
    return undefined;
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  const requestId = typeof value.requestId === 'string' ? value.requestId : undefined;

  switch (value.type) {
    case 'create_room':
      if (typeof value.playerName !== 'string') {
        return undefined;
      }
      return {
        type: 'create_room',
        requestId,
        playerName: value.playerName,
      };

    case 'join_room': {
      const playerName = typeof value.playerName === 'string' ? value.playerName : value.displayName;
      if (typeof value.roomId !== 'string' || typeof playerName !== 'string') {
        return undefined;
      }
      return {
        type: 'join_room',
        requestId,
        roomId: value.roomId,
        playerName,
      };
    }

    case 'leave_room':
      return {
        type: 'leave_room',
        requestId,
      };

    case 'set_ready':
      if (typeof value.ready !== 'boolean') {
        return undefined;
      }
      return {
        type: 'set_ready',
        requestId,
        ready: value.ready,
      };

    case 'player_ready':
      if (typeof value.isReady !== 'boolean') {
        return undefined;
      }
      return {
        type: 'player_ready',
        requestId,
        isReady: value.isReady,
      };

    case 'start_match':
      return {
        type: 'start_match',
        requestId,
      };

    case 'player_input': {
      if (typeof value.moveX !== 'number' || typeof value.moveY !== 'number') {
        return undefined;
      }

      const action = value.action === 'switch_prop' || value.action === 'attack'
        ? value.action
        : undefined;
      const seq = typeof value.seq === 'number' ? value.seq : undefined;

      return {
        type: 'player_input',
        requestId,
        seq,
        moveX: value.moveX,
        moveY: value.moveY,
        action,
      };
    }

    default:
      return undefined;
  }
}

function roomJoinedMessage(playerId: string, room: PublicRoomState, requestId?: string): ServerRoomMessage {
  return {
    type: 'room_joined',
    requestId,
    serverTimeMs: Date.now(),
    playerId,
    room,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
