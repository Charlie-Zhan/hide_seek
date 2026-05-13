import type { PublicRoomPlayer, PublicRoomState } from '@prop-hide-seek/shared';

export interface SessionSnapshot {
  roomId: string | null;
  playerId: string | null;
  playerName: string;
  latestRoom: PublicRoomState | null;
}

export class SessionState {
  private roomId: string | null = null;
  private playerId: string | null = null;
  private playerName = '';
  private latestRoom: PublicRoomState | null = null;

  public setPlayerName(playerName: string): void {
    this.playerName = playerName.trim();
    this.syncLocalPlayerFromRoom();
  }

  public setPlayerId(playerId: string | null): void {
    this.playerId = normalizeNullableText(playerId);
  }

  public setRoom(room: PublicRoomState, playerId?: string | null): void {
    this.roomId = room.roomId;
    this.latestRoom = cloneRoom(room);

    if (playerId !== undefined) {
      this.setPlayerId(playerId);
    }

    this.syncLocalPlayerFromRoom();
  }

  public clearRoom(): void {
    this.roomId = null;
    this.latestRoom = null;
  }

  public reset(): void {
    this.roomId = null;
    this.playerId = null;
    this.playerName = '';
    this.latestRoom = null;
  }

  public getRoomId(): string | null {
    return this.roomId;
  }

  public getPlayerId(): string | null {
    return this.playerId;
  }

  public getPlayerName(): string {
    return this.playerName;
  }

  public getLatestRoom(): PublicRoomState | null {
    return this.latestRoom ? cloneRoom(this.latestRoom) : null;
  }

  public getLocalRoomPlayer(): PublicRoomPlayer | null {
    if (!this.latestRoom) {
      return null;
    }

    const byPlayerId = this.playerId
      ? this.latestRoom.players.find((player) => player.playerId === this.playerId)
      : undefined;
    if (byPlayerId) {
      return { ...byPlayerId };
    }

    const byName = this.findPlayerByName(this.latestRoom.players);
    return byName ? { ...byName } : null;
  }

  public getSnapshot(): SessionSnapshot {
    return {
      roomId: this.roomId,
      playerId: this.playerId,
      playerName: this.playerName,
      latestRoom: this.latestRoom ? cloneRoom(this.latestRoom) : null
    };
  }

  private syncLocalPlayerFromRoom(): void {
    if (!this.latestRoom || this.playerId) {
      return;
    }

    const localPlayer = this.findPlayerByName(this.latestRoom.players);
    if (localPlayer) {
      this.playerId = localPlayer.playerId;
    }
  }

  private findPlayerByName(players: PublicRoomPlayer[]): PublicRoomPlayer | undefined {
    if (this.playerName.length === 0) {
      return undefined;
    }

    return players.find(
      (player) => player.playerName === this.playerName || player.displayName === this.playerName
    );
  }
}

export const sessionState = new SessionState();

function cloneRoom(room: PublicRoomState): PublicRoomState {
  return {
    ...room,
    players: room.players.map((player) => ({ ...player }))
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}
