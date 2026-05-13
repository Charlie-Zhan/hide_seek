export const DEFAULT_MIN_PLAYERS = 2;
export const DEFAULT_MAX_PLAYERS = 4;

export type RoomStatus = 'waiting' | 'playing' | 'finished';

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

export interface RoomPlayer {
  readonly playerId: string;
  readonly playerName: string;
  readonly displayName: string;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly isOwner: boolean;
  readonly joinedAtMs: number;
}

export interface PublicRoomState {
  readonly roomId: string;
  readonly status: RoomStatus;
  readonly mapId: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly ownerPlayerId?: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly startedAtMs?: number;
  readonly players: RoomPlayer[];
}

interface RoomRecord {
  roomId: string;
  status: RoomStatus;
  mapId: string;
  minPlayers: number;
  maxPlayers: number;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs?: number;
  players: RoomPlayer[];
}

export interface RoomServiceOptions {
  readonly minPlayers?: number;
  readonly maxPlayers?: number;
  readonly mapId?: string;
  readonly roomCodeLength?: number;
  readonly nowMs?: () => number;
}

export interface RoomServiceSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface RoomServiceFailure {
  readonly ok: false;
  readonly error: RoomServiceError;
}

export interface RoomServiceError {
  readonly code: RoomErrorCode;
  readonly message: string;
}

export type RoomServiceResult<T> = RoomServiceSuccess<T> | RoomServiceFailure;

export interface LeaveRoomValue {
  readonly room?: PublicRoomState;
  readonly roomId: string;
  readonly removedPlayerId: string;
  readonly roomDeleted: boolean;
}

export class RoomService {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly playerRoomIds = new Map<string, string>();
  private readonly minPlayers: number;
  private readonly maxPlayers: number;
  private readonly mapId: string;
  private readonly roomCodeLength: number;
  private readonly nowMs: () => number;

  public constructor(options: RoomServiceOptions = {}) {
    this.minPlayers = options.minPlayers ?? DEFAULT_MIN_PLAYERS;
    this.maxPlayers = options.maxPlayers ?? DEFAULT_MAX_PLAYERS;
    this.mapId = options.mapId ?? 'kitchen_01';
    this.roomCodeLength = options.roomCodeLength ?? 4;
    this.nowMs = options.nowMs ?? Date.now;
  }

  public createRoom(playerId: string, playerName: string): RoomServiceResult<PublicRoomState> {
    const cleanName = normalizePlayerName(playerName);
    if (cleanName === undefined) {
      return failure('invalid_player_name', 'Player name must be 1 to 16 characters.');
    }

    if (this.playerRoomIds.has(playerId)) {
      return failure('duplicate_join', 'Player is already in a room.');
    }

    const roomId = this.generateRoomId();
    const now = this.nowMs();
    const room: RoomRecord = {
      roomId,
      status: 'waiting',
      mapId: this.mapId,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      createdAtMs: now,
      updatedAtMs: now,
      players: [
        {
          playerId,
          playerName: cleanName,
          displayName: cleanName,
          ready: false,
          connected: true,
          isOwner: true,
          joinedAtMs: now,
        },
      ],
    };

    this.rooms.set(roomId, room);
    this.playerRoomIds.set(playerId, roomId);

    return success(toPublicRoomState(room));
  }

  public joinRoom(roomId: string, playerId: string, playerName: string): RoomServiceResult<PublicRoomState> {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (room === undefined) {
      return failure('room_not_found', 'Room does not exist.');
    }

    if (room.status !== 'waiting') {
      return failure('match_already_started', 'Match has already started.');
    }

    const cleanName = normalizePlayerName(playerName);
    if (cleanName === undefined) {
      return failure('invalid_player_name', 'Player name must be 1 to 16 characters.');
    }

    if (this.playerRoomIds.has(playerId) || room.players.some((player) => player.playerId === playerId)) {
      return failure('duplicate_join', 'Player is already in a room.');
    }

    if (room.players.length >= room.maxPlayers) {
      return failure('room_full', 'Room is full.');
    }

    room.players = [
      ...room.players,
      {
        playerId,
        playerName: cleanName,
        displayName: cleanName,
        ready: false,
        connected: true,
        isOwner: false,
        joinedAtMs: this.nowMs(),
      },
    ];
    touchRoom(room, this.nowMs());
    this.playerRoomIds.set(playerId, room.roomId);

    return success(toPublicRoomState(room));
  }

  public resumeRoom(roomId: string, playerId: string, playerName: string): RoomServiceResult<PublicRoomState> {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (room === undefined) {
      return failure('room_not_found', 'Room does not exist.');
    }

    const cleanName = normalizePlayerName(playerName);
    if (cleanName === undefined) {
      return failure('invalid_player_name', 'Player name must be 1 to 16 characters.');
    }

    const player = room.players.find((candidate) => candidate.playerId === playerId);
    if (player === undefined) {
      return failure('not_in_room', 'Player is not in this room.');
    }

    room.players = room.players.map((candidate) =>
      candidate.playerId === playerId
        ? {
            ...candidate,
            connected: true,
          }
        : candidate,
    );
    this.playerRoomIds.set(playerId, room.roomId);
    touchRoom(room, this.nowMs());

    return success(toPublicRoomState(room));
  }

  public leaveRoom(playerId: string): RoomServiceResult<LeaveRoomValue> {
    return this.removePlayerFromWaitingRoom(playerId, false);
  }

  public disconnectPlayer(playerId: string): RoomServiceResult<LeaveRoomValue> {
    const room = this.getRoomForPlayer(playerId);
    if (room === undefined) {
      return failure('not_in_room', 'Player is not in a room.');
    }

    if (room.status !== 'waiting') {
      room.players = room.players.map((player) =>
        player.playerId === playerId
          ? {
              ...player,
              connected: false,
            }
          : player,
      );
      touchRoom(room, this.nowMs());

      return success({
        room: toPublicRoomState(room),
        roomId: room.roomId,
        removedPlayerId: playerId,
        roomDeleted: false,
      });
    }

    return this.removePlayerFromWaitingRoom(playerId, true);
  }

  public setReady(playerId: string, ready: boolean): RoomServiceResult<PublicRoomState> {
    const room = this.getRoomForPlayer(playerId);
    if (room === undefined) {
      return failure('not_in_room', 'Player is not in a room.');
    }

    if (room.status !== 'waiting') {
      return failure('match_already_started', 'Match has already started.');
    }

    room.players = room.players.map((player) =>
      player.playerId === playerId
        ? {
            ...player,
            ready,
          }
        : player,
    );
    touchRoom(room, this.nowMs());

    return success(toPublicRoomState(room));
  }

  public startMatch(playerId: string): RoomServiceResult<PublicRoomState> {
    const room = this.getRoomForPlayer(playerId);
    if (room === undefined) {
      return failure('not_in_room', 'Player is not in a room.');
    }

    if (room.status !== 'waiting') {
      return failure('match_already_started', 'Match has already started.');
    }

    const starter = room.players.find((player) => player.playerId === playerId);
    if (starter?.isOwner !== true) {
      return failure('not_room_owner', 'Only the room owner can start the match.');
    }

    if (room.players.length < room.minPlayers) {
      return failure('not_enough_players', `At least ${room.minPlayers} players are required.`);
    }

    if (room.players.some((player) => !player.connected)) {
      return failure('player_disconnected', 'All players must be connected before starting.');
    }

    if (room.players.some((player) => !player.ready)) {
      return failure('players_not_ready', 'All players must be ready before starting.');
    }

    room.status = 'playing';
    room.startedAtMs = this.nowMs();
    touchRoom(room, room.startedAtMs);

    return success(toPublicRoomState(room));
  }

  public restartFinishedRoom(playerId: string): RoomServiceResult<PublicRoomState> {
    const room = this.getRoomForPlayer(playerId);
    if (room === undefined) {
      return failure('not_in_room', 'Player is not in a room.');
    }

    const starter = room.players.find((player) => player.playerId === playerId);
    if (starter?.isOwner !== true) {
      return failure('not_room_owner', 'Only the room owner can restart the room.');
    }

    if (room.status === 'playing') {
      return failure('match_already_started', 'Match is still in progress.');
    }

    if (room.status !== 'finished') {
      return failure('match_not_finished', 'Room can only be restarted after MatchEnd.');
    }

    room.status = 'waiting';
    room.startedAtMs = undefined;
    room.players = room.players.map((player) => ({
      ...player,
      ready: false,
    }));
    touchRoom(room, this.nowMs());

    return success(toPublicRoomState(room));
  }

  public getRoom(roomId: string): PublicRoomState | undefined {
    const room = this.rooms.get(normalizeRoomId(roomId));
    return room === undefined ? undefined : toPublicRoomState(room);
  }

  public finishMatch(roomId: string): RoomServiceResult<PublicRoomState> {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (room === undefined) {
      return failure('room_not_found', 'Room does not exist.');
    }

    room.status = 'finished';
    touchRoom(room, this.nowMs());

    return success(toPublicRoomState(room));
  }

  public getPlayerRoom(playerId: string): PublicRoomState | undefined {
    const room = this.getRoomForPlayer(playerId);
    return room === undefined ? undefined : toPublicRoomState(room);
  }

  public getRoomIdForPlayer(playerId: string): string | undefined {
    return this.playerRoomIds.get(playerId);
  }

  public listRooms(): PublicRoomState[] {
    return [...this.rooms.values()].map(toPublicRoomState);
  }

  private removePlayerFromWaitingRoom(playerId: string, _wasDisconnect: boolean): RoomServiceResult<LeaveRoomValue> {
    const room = this.getRoomForPlayer(playerId);
    if (room === undefined) {
      return failure('not_in_room', 'Player is not in a room.');
    }

    if (room.status !== 'waiting') {
      return failure('match_already_started', 'Match has already started.');
    }

    const removedPlayer = room.players.find((player) => player.playerId === playerId);
    if (removedPlayer === undefined) {
      this.playerRoomIds.delete(playerId);
      return failure('not_in_room', 'Player is not in a room.');
    }

    room.players = room.players.filter((player) => player.playerId !== playerId);
    this.playerRoomIds.delete(playerId);

    if (room.players.length === 0) {
      this.rooms.delete(room.roomId);
      return success({
        roomId: room.roomId,
        removedPlayerId: playerId,
        roomDeleted: true,
      });
    }

    touchRoom(room, this.nowMs());

    if (removedPlayer.isOwner) {
      const [nextOwner, ...remainingPlayers] = room.players;
      room.players = [
        {
          ...nextOwner,
          isOwner: true,
        },
        ...remainingPlayers,
      ];
    }

    return success({
      room: toPublicRoomState(room),
      roomId: room.roomId,
      removedPlayerId: playerId,
      roomDeleted: false,
    });
  }

  private getRoomForPlayer(playerId: string): RoomRecord | undefined {
    const roomId = this.playerRoomIds.get(playerId);
    if (roomId === undefined) {
      return undefined;
    }

    return this.rooms.get(roomId);
  }

  private generateRoomId(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let index = 0; index < this.roomCodeLength; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }

      if (!this.rooms.has(code)) {
        return code;
      }
    }

    throw new Error('Unable to allocate room code.');
  }
}

function normalizePlayerName(playerName: string): string | undefined {
  const cleanName = playerName.trim();
  if (cleanName.length < 1 || cleanName.length > 16) {
    return undefined;
  }

  return cleanName;
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

function toPublicRoomState(room: RoomRecord): PublicRoomState {
  const owner = room.players.find((player) => player.isOwner);

  return {
    roomId: room.roomId,
    status: room.status,
    mapId: room.mapId,
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers,
    ownerPlayerId: owner?.playerId,
    createdAtMs: room.createdAtMs,
    updatedAtMs: room.updatedAtMs,
    startedAtMs: room.startedAtMs,
    players: room.players.map((player) => ({ ...player })),
  };
}

function touchRoom(room: RoomRecord, nowMs: number): void {
  room.updatedAtMs = nowMs;
}

function success<T>(value: T): RoomServiceSuccess<T> {
  return {
    ok: true,
    value,
  };
}

function failure(code: RoomErrorCode, message: string): RoomServiceFailure {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}
