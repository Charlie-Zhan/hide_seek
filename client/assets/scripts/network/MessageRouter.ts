import type {
  GameEventMessage,
  MatchStartingServerMessage,
  RoomErrorServerMessage,
  RoomJoinedServerMessage,
  RoomUpdatedServerMessage,
  ServerStateMessage
} from '@prop-hide-seek/shared';
import { sessionState } from '../core/SessionState';
import type { NetworkClient, ServerNetworkMessage } from './NetworkClient';
import { roomNetworkClient } from './NetworkClient';

export interface MessageRouterHandlers {
  onRoomJoined?: (message: RoomJoinedServerMessage) => void;
  onRoomUpdated?: (message: RoomUpdatedServerMessage) => void;
  onMatchStarting?: (message: MatchStartingServerMessage) => void;
  onState?: (message: ServerStateMessage) => void;
  onGameEvent?: (message: GameEventMessage) => void;
  onError?: (message: RoomErrorServerMessage) => void;
  onLoadGameScene?: () => void;
}

export class MessageRouter {
  private stopListening: (() => void) | null = null;

  public constructor(
    private readonly networkClient: NetworkClient = roomNetworkClient,
    private handlers: MessageRouterHandlers = {}
  ) {}

  public start(): void {
    if (this.stopListening) {
      return;
    }

    this.stopListening = this.networkClient.onMessage((message) => this.route(message));
  }

  public stop(): void {
    this.stopListening?.();
    this.stopListening = null;
  }

  public setHandlers(handlers: MessageRouterHandlers): void {
    this.handlers = handlers;
  }

  public route(message: ServerNetworkMessage): void {
    switch (message.type) {
      case 'room_joined':
        sessionState.setRoom(message.room, getOptionalPlayerId(message));
        this.handlers.onRoomJoined?.(message);
        break;
      case 'room_updated':
        sessionState.setRoom(message.room, getOptionalPlayerId(message));
        this.handlers.onRoomUpdated?.(message);
        break;
      case 'match_starting':
        sessionState.setRoom(message.room, getOptionalPlayerId(message));
        this.handlers.onMatchStarting?.(message);
        this.handlers.onLoadGameScene?.();
        break;
      case 'state':
        this.handlers.onState?.(message);
        break;
      case 'game_event':
        this.handlers.onGameEvent?.(message);
        break;
      case 'error':
        this.handlers.onError?.(message);
        break;
      default:
        exhaustive(message);
    }
  }
}

function getOptionalPlayerId(message: ServerNetworkMessage): string | null {
  const maybePlayerId = (message as { playerId?: unknown }).playerId;
  return typeof maybePlayerId === 'string' && maybePlayerId.trim().length > 0 ? maybePlayerId : null;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled room message: ${JSON.stringify(value)}`);
}
