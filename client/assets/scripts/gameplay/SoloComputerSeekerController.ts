import { distance, normalizeVector2, subtractVector2, ZERO_VECTOR } from '../util/Geometry2D';
import { LocalGameEngine } from './LocalGameEngine';
import { type LocalGameSnapshot, PlayerRole, PlayerState, RoundPhase, type Vector2 } from './LocalGameTypes';

export interface SoloComputerSeekerOptions {
  humanPlayerId: string;
  attackIntervalMs?: number;
  suspiciousMovementRangePx?: number;
  attackDistancePx?: number;
}

const DEFAULT_ATTACK_INTERVAL_MS = 2200;
const DEFAULT_SUSPICIOUS_MOVEMENT_RANGE_PX = 240;
const DEFAULT_ATTACK_DISTANCE_PX = 105;
const TARGET_REACHED_DISTANCE_PX = 40;
const STUCK_MOVEMENT_EPSILON_PX = 1;
const STUCK_RECOVERY_TRIGGER_MS = 480;
const STUCK_RECOVERY_DURATION_MS = 720;

export class SoloComputerSeekerController {
  private attackElapsedMs = 0;
  private targetPropIndex = 0;
  private lastRoundIndex = -1;
  private lastSeekerPosition: Vector2 | null = null;
  private stuckElapsedMs = 0;
  private recoveryRemainingMs = 0;
  private recoveryDirection: Vector2 = ZERO_VECTOR;

  public constructor(private readonly options: SoloComputerSeekerOptions) {}

  public reset(): void {
    this.attackElapsedMs = 0;
    this.targetPropIndex = 0;
    this.lastRoundIndex = -1;
    this.resetStuckRecovery();
  }

  public update(engine: LocalGameEngine, snapshot: LocalGameSnapshot, deltaMs: number): string | null {
    const seeker = snapshot.players[snapshot.seekerIndex] ?? null;
    if (!seeker || seeker.playerId === this.options.humanPlayerId || seeker.role !== PlayerRole.Seeker) {
      return null;
    }

    if (snapshot.phase !== RoundPhase.Seek || snapshot.attackCountRemaining <= 0) {
      engine.clearMovementInput(seeker.playerId);
      this.attackElapsedMs = 0;
      this.resetStuckRecovery();
      return null;
    }

    if (this.lastRoundIndex !== snapshot.roundIndex) {
      this.lastRoundIndex = snapshot.roundIndex;
      this.attackElapsedMs = 0;
      this.targetPropIndex = 0;
      this.resetStuckRecovery();
    }

    this.attackElapsedMs += Math.max(0, deltaMs);
    const target = this.chooseTarget(snapshot, seeker.position);
    if (!target) {
      engine.clearMovementInput(seeker.playerId);
      return null;
    }

    const toTarget = subtractVector2(target.position, seeker.position);
    const targetDistance = distance(seeker.position, target.position);
    const shouldMove = targetDistance > TARGET_REACHED_DISTANCE_PX;
    this.updateStuckRecovery(snapshot, seeker.position, target, targetDistance, toTarget, deltaMs);
    const recoveryDirection = this.getRecoveryMovementDirection(deltaMs);
    const movementDirection = shouldMove
      ? recoveryDirection ?? normalizeVector2(toTarget)
      : ZERO_VECTOR;
    engine.setFacingDirection(seeker.playerId, toTarget);
    engine.setMovementInput({
      playerId: seeker.playerId,
      direction: movementDirection
    });

    if (targetDistance <= (this.options.attackDistancePx ?? DEFAULT_ATTACK_DISTANCE_PX) && this.canAttack()) {
      this.attackElapsedMs = 0;
      const result = engine.attack(seeker.playerId);
      return result.accepted
        ? `${seeker.displayName} attacked: ${result.destroyedPropIds.length} props, ${result.capturedPlayerIds.length} hiders`
        : null;
    }

    return null;
  }

  private canAttack(): boolean {
    return this.attackElapsedMs >= (this.options.attackIntervalMs ?? DEFAULT_ATTACK_INTERVAL_MS);
  }

  private chooseTarget(snapshot: LocalGameSnapshot, seekerPosition: Vector2): SoloComputerTarget | null {
    const movingHider = this.findSuspiciousMovingHider(snapshot, seekerPosition);
    if (movingHider) {
      return movingHider;
    }

    const props = snapshot.props.filter((prop) => prop.breakable && !prop.destroyed);
    if (props.length === 0) {
      return null;
    }

    if (this.targetPropIndex >= props.length) {
      this.targetPropIndex = 0;
    }

    const target = props[this.targetPropIndex];
    if (!target) {
      return null;
    }

    if (distance(seekerPosition, target.position) <= TARGET_REACHED_DISTANCE_PX) {
      this.targetPropIndex = (this.targetPropIndex + 1) % props.length;
    }

    return { kind: 'prop', position: target.position };
  }

  private findSuspiciousMovingHider(snapshot: LocalGameSnapshot, seekerPosition: Vector2): SoloComputerTarget | null {
    const range = this.options.suspiciousMovementRangePx ?? DEFAULT_SUSPICIOUS_MOVEMENT_RANGE_PX;
    const movingHiders = snapshot.players.filter(
      (player) =>
        player.role === PlayerRole.Hider &&
        !player.captured &&
        (player.state === PlayerState.HiderMovingAsCharacter || player.state === PlayerState.HiderDisguisedMoving)
    );

    let bestTarget: SoloComputerTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const hider of movingHiders) {
      const hiderDistance = distance(seekerPosition, hider.position);
      if (hiderDistance <= range && hiderDistance < bestDistance) {
        bestDistance = hiderDistance;
        bestTarget = { kind: 'hider', position: hider.position };
      }
    }

    return bestTarget;
  }

  private updateStuckRecovery(
    snapshot: LocalGameSnapshot,
    seekerPosition: Vector2,
    target: SoloComputerTarget,
    targetDistance: number,
    toTarget: Vector2,
    deltaMs: number
  ): void {
    if (targetDistance <= TARGET_REACHED_DISTANCE_PX) {
      this.lastSeekerPosition = seekerPosition;
      this.stuckElapsedMs = 0;
      return;
    }

    if (!this.lastSeekerPosition) {
      this.lastSeekerPosition = seekerPosition;
      return;
    }

    const movedDistance = distance(this.lastSeekerPosition, seekerPosition);
    this.lastSeekerPosition = seekerPosition;
    if (movedDistance > STUCK_MOVEMENT_EPSILON_PX) {
      this.stuckElapsedMs = 0;
      return;
    }

    this.stuckElapsedMs += Math.max(0, deltaMs);
    if (this.stuckElapsedMs < STUCK_RECOVERY_TRIGGER_MS) {
      return;
    }

    const direct = normalizeVector2(toTarget);
    const turnSign = this.targetPropIndex % 2 === 0 ? 1 : -1;
    this.recoveryDirection = normalizeVector2({
      x: -direct.y * turnSign,
      y: direct.x * turnSign
    });
    this.recoveryRemainingMs = STUCK_RECOVERY_DURATION_MS;
    this.stuckElapsedMs = 0;

    if (target.kind === 'prop') {
      const props = snapshot.props.filter((prop) => prop.breakable && !prop.destroyed);
      if (props.length > 0) {
        this.targetPropIndex = (this.targetPropIndex + 1) % props.length;
      }
    }
  }

  private getRecoveryMovementDirection(deltaMs: number): Vector2 | null {
    if (this.recoveryRemainingMs <= 0) {
      return null;
    }

    this.recoveryRemainingMs = Math.max(0, this.recoveryRemainingMs - Math.max(0, deltaMs));
    return this.recoveryDirection;
  }

  private resetStuckRecovery(): void {
    this.lastSeekerPosition = null;
    this.stuckElapsedMs = 0;
    this.recoveryRemainingMs = 0;
    this.recoveryDirection = ZERO_VECTOR;
  }
}

interface SoloComputerTarget {
  kind: 'hider' | 'prop';
  position: Vector2;
}
