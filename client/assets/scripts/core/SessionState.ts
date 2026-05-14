import type { PublicRoomPlayer, PublicRoomState } from '@prop-hide-seek/shared';

export type GameplayMode = 'multiplayer' | 'solo';

export interface SessionSnapshot {
  roomId: string | null;
  playerId: string | null;
  playerName: string;
  latestRoom: PublicRoomState | null;
  gameplayMode: GameplayMode;
  soloComputerCount: number;
}

export const MIN_SOLO_COMPUTER_COUNT = 1;
export const MAX_SOLO_COMPUTER_COUNT = 4;
export const DEFAULT_SOLO_COMPUTER_COUNT = 2;

export class SessionState {
  private roomId: string | null = null;
  private playerId: string | null = null;
  private playerName = '';
  private latestRoom: PublicRoomState | null = null;
  private gameplayMode: GameplayMode = 'multiplayer';
  private soloComputerCount = DEFAULT_SOLO_COMPUTER_COUNT;

  public setPlayerName(playerName: string): void {
    this.playerName = playerName.trim();
    this.syncLocalPlayerFromRoom();
  }

  public setPlayerId(playerId: string | null): void {
    this.playerId = normalizeNullableText(playerId);
  }

  public setRoom(room: PublicRoomState, playerId?: string | null): void {
    this.gameplayMode = 'multiplayer';
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

  public startSoloMode(
    playerName?: string | null,
    playerId = 'solo_player_1',
    computerCount = this.soloComputerCount
  ): void {
    const normalizedName = playerName?.trim() ?? '';
    if (normalizedName.length > 0) {
      this.playerName = normalizedName;
    } else if (this.playerName.length === 0) {
      this.playerName = 'Solo Player';
    }

    this.gameplayMode = 'solo';
    this.roomId = null;
    this.latestRoom = null;
    this.playerId = playerId;
    this.soloComputerCount = normalizeSoloComputerCount(computerCount);
  }

  public startMultiplayerMode(): void {
    this.gameplayMode = 'multiplayer';
  }

  public reset(): void {
    this.roomId = null;
    this.playerId = null;
    this.playerName = '';
    this.latestRoom = null;
    this.gameplayMode = 'multiplayer';
    this.soloComputerCount = DEFAULT_SOLO_COMPUTER_COUNT;
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

  public getGameplayMode(): GameplayMode {
    return this.gameplayMode;
  }

  public isSoloMode(): boolean {
    return this.gameplayMode === 'solo';
  }

  public setSoloComputerCount(count: number): void {
    this.soloComputerCount = normalizeSoloComputerCount(count);
  }

  public getSoloComputerCount(): number {
    return this.soloComputerCount;
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
      latestRoom: this.latestRoom ? cloneRoom(this.latestRoom) : null,
      gameplayMode: this.gameplayMode,
      soloComputerCount: this.soloComputerCount
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

function normalizeSoloComputerCount(count: number): number {
  if (!Number.isFinite(count)) {
    return DEFAULT_SOLO_COMPUTER_COUNT;
  }

  return Math.max(MIN_SOLO_COMPUTER_COUNT, Math.min(MAX_SOLO_COMPUTER_COUNT, Math.round(count)));
}
