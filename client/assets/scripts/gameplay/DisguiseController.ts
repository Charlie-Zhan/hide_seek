import { isNonZeroVector } from '../util/Geometry2D';
import {
  DEFAULT_HIDE_IDLE_DISGUISE_MS,
  type LocalPlayer,
  PlayerRole,
  PlayerState,
  RoundPhase,
  type Vector2
} from './LocalGameTypes';

export class DisguiseController {
  private readonly idleMsByPlayerId = new Map<string, number>();

  public constructor(private readonly idleThresholdMs = DEFAULT_HIDE_IDLE_DISGUISE_MS) {}

  public reset(players: LocalPlayer[]): void {
    this.idleMsByPlayerId.clear();
    for (const player of players) {
      this.idleMsByPlayerId.set(player.playerId, 0);
    }
  }

  public switchToNextProp(player: LocalPlayer, availablePropIds: string[]): boolean {
    if (player.role !== PlayerRole.Hider || player.captured || availablePropIds.length === 0) {
      return false;
    }

    const currentIndex = availablePropIds.indexOf(player.currentPropId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % availablePropIds.length;
    const nextPropId = availablePropIds[nextIndex];
    if (nextPropId === undefined) {
      return false;
    }

    player.currentPropId = nextPropId;
    return true;
  }

  public updatePlayerState(player: LocalPlayer, phase: RoundPhase, movementDirection: Vector2, deltaMs: number): void {
    if (player.captured) {
      player.state = PlayerState.Captured;
      return;
    }

    if (phase === RoundPhase.Preview) {
      player.state = PlayerState.InvisibleInPreview;
      this.idleMsByPlayerId.set(player.playerId, 0);
      return;
    }

    if (player.role === PlayerRole.Seeker) {
      player.state = phase === RoundPhase.Hide ? PlayerState.SeekerLocked : PlayerState.HiderMovingAsCharacter;
      this.idleMsByPlayerId.set(player.playerId, 0);
      return;
    }

    if (phase === RoundPhase.Hide) {
      this.updateHiderInHide(player, movementDirection, deltaMs);
      return;
    }

    if (phase === RoundPhase.Seek || phase === RoundPhase.Result || phase === RoundPhase.MatchEnd) {
      player.state = isNonZeroVector(movementDirection)
        ? PlayerState.HiderDisguisedMoving
        : PlayerState.HiderDisguisedIdle;
      return;
    }
  }

  private updateHiderInHide(player: LocalPlayer, movementDirection: Vector2, deltaMs: number): void {
    if (isNonZeroVector(movementDirection)) {
      this.idleMsByPlayerId.set(player.playerId, 0);
      player.state = PlayerState.HiderMovingAsCharacter;
      return;
    }

    const idleMs = (this.idleMsByPlayerId.get(player.playerId) ?? 0) + deltaMs;
    this.idleMsByPlayerId.set(player.playerId, idleMs);
    player.state = idleMs >= this.idleThresholdMs
      ? PlayerState.HiderDisguisedIdle
      : PlayerState.HiderMovingAsCharacter;
  }
}

