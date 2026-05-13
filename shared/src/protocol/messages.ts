import type { RoundPhase } from '../types/round.js';
import type { Vector2 } from '../types/geometry.js';
import type { PublicPlayerState } from '../types/player.js';
import type { GameEvent } from './events.js';
import type { PublicPropState, PublicRoomState, RoomStateSnapshot } from './room.js';

export type ClientMessageType =
  | 'create_room'
  | 'join_room'
  | 'resume_room'
  | 'leave_room'
  | 'set_ready'
  | 'player_ready'
  | 'start_match'
  | 'restart_room'
  | 'player_input';

export type ServerMessageType =
  | 'welcome'
  | 'room_joined'
  | 'room_updated'
  | 'match_starting'
  | 'room_state'
  | 'state'
  | 'phase_changed'
  | 'game_event'
  | 'error';

export type PlayerInputAction = 'switch_prop' | 'attack';

export type RoomErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'invalid_player_name'
  | 'duplicate_join'
  | 'not_in_room'
  | 'not_room_owner'
  | 'not_enough_players'
  | 'players_not_ready'
  | 'player_disconnected'
  | 'match_already_started'
  | 'match_not_finished'
  | 'invalid_message';

export interface CreateRoomClientMessage {
  type: 'create_room';
  playerName: string;
}

export interface JoinRoomClientMessage {
  type: 'join_room';
  roomId: string;
  playerName: string;
}

export interface ResumeRoomClientMessage {
  type: 'resume_room';
  roomId: string;
  playerId: string;
  playerName: string;
}

export interface LeaveRoomClientMessage {
  type: 'leave_room';
}

export interface SetReadyClientMessage {
  type: 'set_ready';
  ready: boolean;
}

export interface StartMatchClientMessage {
  type: 'start_match';
}

export interface RestartRoomClientMessage {
  type: 'restart_room';
}

export type ClientRoomMessage =
  | CreateRoomClientMessage
  | JoinRoomClientMessage
  | ResumeRoomClientMessage
  | LeaveRoomClientMessage
  | SetReadyClientMessage
  | StartMatchClientMessage
  | RestartRoomClientMessage;

export interface RoomJoinedServerMessage {
  type: 'room_joined';
  room: PublicRoomState;
}

export interface RoomUpdatedServerMessage {
  type: 'room_updated';
  room: PublicRoomState;
}

export interface MatchStartingServerMessage {
  type: 'match_starting';
  room: PublicRoomState;
}

export interface RoomErrorServerMessage {
  type: 'error';
  code: RoomErrorCode;
  message: string;
}

export type ServerRoomMessage =
  | RoomJoinedServerMessage
  | RoomUpdatedServerMessage
  | MatchStartingServerMessage
  | RoomErrorServerMessage;

export interface ClientMessageBase {
  type: ClientMessageType;
  requestId?: string;
}

export interface JoinRoomMessage extends ClientMessageBase {
  type: 'join_room';
  roomId?: string;
  displayName: string;
}

export interface LeaveRoomMessage extends ClientMessageBase {
  type: 'leave_room';
  roomId: string;
}

export interface PlayerReadyMessage extends ClientMessageBase {
  type: 'player_ready';
  roomId: string;
  isReady: boolean;
}

export interface StartMatchMessage extends ClientMessageBase {
  type: 'start_match';
  roomId: string;
}

export interface PlayerInputMessage extends ClientMessageBase {
  type: 'player_input';
  seq: number;
  moveX: number;
  moveY: number;
  action?: PlayerInputAction;
  clientTimeMs?: number;
}

export type ClientInGameMessage = PlayerInputMessage;

export type ClientRoomOrGameMessage = ClientRoomMessage | ClientInGameMessage;

export type ClientToServerMessage =
  | ClientRoomOrGameMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | PlayerReadyMessage
  | StartMatchMessage;

export interface ServerMessageBase {
  type: ServerMessageType;
  requestId?: string;
  serverTimeMs: number;
}

export interface WelcomeMessage extends ServerMessageBase {
  type: 'welcome';
  playerId: string;
}

export interface RoomStateMessage extends ServerMessageBase {
  type: 'room_state';
  room: RoomStateSnapshot;
}

export type PublicV2ObjectiveType = 'hold_point';

export interface PublicV2ObjectiveState {
  objectiveId: string;
  objectiveType: PublicV2ObjectiveType;
  position: Vector2;
  radius: number;
  requiredHoldMs: number;
  progressMs: number;
  completed: boolean;
  completedBy?: string;
  reward: number;
}

export type PublicV2AmbientEventType = 'local_disruption';

export type PublicV2AmbientEventStatus = 'hint' | 'active' | 'ended';

export interface PublicV2AmbientEventState {
  eventId: string;
  eventType: PublicV2AmbientEventType;
  status: PublicV2AmbientEventStatus;
  position: Vector2;
  radius: number;
  startsAtMs: number;
  endsAtMs: number;
}

export interface ServerStateMessage extends ServerMessageBase {
  type: 'state';
  serverTick: number;
  roomId: string;
  phase: RoundPhase;
  timeLeftMs: number;
  players: PublicPlayerState[];
  props: PublicPropState[];
  events: GameEvent[];
  scores: Record<string, number>;
  attackCountRemaining: number;
  roundIndex: number;
  seekerPlayerId: string;
  v2Objectives?: PublicV2ObjectiveState[];
  v2Events?: PublicV2AmbientEventState[];
}

export interface PhaseChangedMessage extends ServerMessageBase {
  type: 'phase_changed';
  phase: RoundPhase;
  phaseEndsAtMs: number;
}

export interface GameEventMessage extends ServerMessageBase {
  type: 'game_event';
  event: GameEvent;
}

export interface ErrorMessage extends ServerMessageBase {
  type: 'error';
  code: string;
  message: string;
}

export type ServerInGameMessage =
  | ServerStateMessage
  | PhaseChangedMessage
  | GameEventMessage;

export type ServerRoomOrGameMessage = ServerRoomMessage | ServerInGameMessage;

export type ServerToClientMessage =
  | ServerRoomOrGameMessage
  | WelcomeMessage
  | RoomStateMessage
  | ErrorMessage;

export type NetworkMessage = ClientToServerMessage | ServerToClientMessage;
