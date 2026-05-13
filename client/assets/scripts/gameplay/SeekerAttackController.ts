import { isPointInSector } from '../util/Geometry2D';
import {
  DEFAULT_PLAYER_RADIUS_PX,
  type GameConfig,
  type LocalAttackResult,
  type LocalPlayer,
  type LocalPropInstance,
  PlayerRole,
  PlayerState
} from './LocalGameTypes';

export class SeekerAttackController {
  public constructor(private readonly config: GameConfig) {}

  public attack(
    seeker: LocalPlayer,
    players: LocalPlayer[],
    props: LocalPropInstance[],
    remainingAttacks: number,
    getHiderRadius: (player: LocalPlayer) => number = () => DEFAULT_PLAYER_RADIUS_PX
  ): LocalAttackResult {
    if (seeker.role !== PlayerRole.Seeker) {
      return this.rejected('Only the seeker can attack.', remainingAttacks);
    }

    if (seeker.captured) {
      return this.rejected('Captured players cannot attack.', remainingAttacks);
    }

    if (remainingAttacks <= 0) {
      return this.rejected('No attacks remaining.', 0);
    }

    const nextRemainingAttacks = remainingAttacks - 1;
    const destroyedPropIds: string[] = [];
    const capturedPlayerIds: string[] = [];

    for (const prop of props) {
      if (!prop.breakable || prop.destroyed) {
        continue;
      }

      if (isPointInSector(seeker.position, seeker.facing, prop.position, this.config.attackRadiusPx, this.config.attackSectorDeg, prop.radius)) {
        prop.destroyed = true;
        destroyedPropIds.push(prop.instanceId);
      }
    }

    for (const player of players) {
      if (player.role !== PlayerRole.Hider || player.captured) {
        continue;
      }

      if (isPointInSector(seeker.position, seeker.facing, player.position, this.config.attackRadiusPx, this.config.attackSectorDeg, getHiderRadius(player))) {
        player.captured = true;
        player.state = PlayerState.Captured;
        capturedPlayerIds.push(player.playerId);
      }
    }

    const allHidersCaptured = players
      .filter((player) => player.role === PlayerRole.Hider)
      .every((player) => player.captured);

    return {
      accepted: true,
      remainingAttacks: nextRemainingAttacks,
      destroyedPropIds,
      capturedPlayerIds,
      endedRound: nextRemainingAttacks <= 0 || allHidersCaptured
    };
  }

  private rejected(reason: string, remainingAttacks: number): LocalAttackResult {
    return {
      accepted: false,
      reason,
      remainingAttacks,
      destroyedPropIds: [],
      capturedPlayerIds: [],
      endedRound: false
    };
  }
}

