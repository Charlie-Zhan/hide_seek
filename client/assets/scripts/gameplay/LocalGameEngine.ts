import {
  circleCircleSeparation,
  circleRectSeparation,
  clampCircleToBounds,
  cloneVector2,
  isPointInsideRect,
  isNonZeroVector,
  moveToward,
  normalizeVector2,
  RIGHT_VECTOR,
  ZERO_VECTOR
} from '../util/Geometry2D';
import { DisguiseController } from './DisguiseController';
import {
  DEFAULT_HIDE_IDLE_DISGUISE_MS,
  DEFAULT_PLAYER_RADIUS_PX,
  MAX_LOCAL_PLAYERS,
  type LocalAttackResult,
  type LocalCollisionRect,
  type LocalGameSetup,
  type LocalMovementBounds,
  type LocalGameSnapshot,
  type LocalPlayer,
  type LocalPropInstance,
  MIN_LOCAL_PLAYERS,
  type PlayerMovementInput,
  PlayerRole,
  PlayerState,
  RoundPhase,
  type Vector2
} from './LocalGameTypes';
import { RoundManager } from './RoundManager';
import { ScoreManager } from './ScoreManager';
import { SeekerAttackController } from './SeekerAttackController';

const PLAYER_MOVEMENT_RADIUS_PX = 12;
const MIN_HIDER_MOVEMENT_RADIUS_PX = 10;
const MAX_HIDER_MOVEMENT_RADIUS_PX = 14;
const PROP_MOVEMENT_RADIUS_SCALE = 1;
const RECT_COLLISION_INSET_PX = 0;
const COLLISION_ESCAPE_EPSILON = 0.001;

export class LocalGameEngine {
  private readonly roundManager: RoundManager;
  private readonly disguiseController: DisguiseController;
  private readonly attackController: SeekerAttackController;
  private readonly scoreManager = new ScoreManager();
  private readonly movementInputsByPlayerId = new Map<string, Vector2>();
  private readonly actualMovementByPlayerId = new Map<string, Vector2>();
  private readonly propRadiusById = new Map<string, number>();
  private readonly availablePropIds: string[];
  private readonly players: LocalPlayer[];
  private readonly initialProps: LocalPropInstance[];
  private readonly props: LocalPropInstance[];
  private readonly obstacles: LocalCollisionRect[];
  private attackCountRemaining = 0;
  private lastRoundResult: LocalGameSnapshot['lastRoundResult'] = null;
  private resultScoredForRoundIndex: number | null = null;

  public constructor(private readonly setup: LocalGameSetup) {
    if (setup.players.length < MIN_LOCAL_PLAYERS || setup.players.length > MAX_LOCAL_PLAYERS) {
      throw new Error(`Local match requires ${MIN_LOCAL_PLAYERS} to ${MAX_LOCAL_PLAYERS} players.`);
    }

    if (setup.availablePropIds.length === 0) {
      throw new Error('At least one disguise prop id is required.');
    }

    this.availablePropIds = [...setup.availablePropIds];
    this.players = this.createPlayers(setup);
    this.initialProps = setup.props?.map(clonePropInstance) ?? [];
    this.props = this.initialProps.map(clonePropInstance);
    this.obstacles = setup.obstacles
      ?.filter((obstacle) => obstacle.blocksMovement && !obstacle.allowsOverlap)
      .map(cloneCollisionRect) ?? [];
    for (const prop of this.props) {
      this.propRadiusById.set(prop.propId, prop.radius);
    }

    this.roundManager = new RoundManager(setup.gameConfig, this.players.length);
    this.disguiseController = new DisguiseController(setup.hideIdleDisguiseMs ?? DEFAULT_HIDE_IDLE_DISGUISE_MS);
    this.attackController = new SeekerAttackController(setup.gameConfig);
    this.enterPhase(RoundPhase.Preview);
  }

  public static createPlayers(playerCount: number): LocalGameSetup['players'] {
    if (playerCount < MIN_LOCAL_PLAYERS || playerCount > MAX_LOCAL_PLAYERS) {
      throw new Error(`Local match requires ${MIN_LOCAL_PLAYERS} to ${MAX_LOCAL_PLAYERS} players.`);
    }

    return Array.from({ length: playerCount }, (_, index) => ({
      playerId: `local_player_${index + 1}`,
      displayName: `Player ${index + 1}`
    }));
  }

  public getSnapshot(): LocalGameSnapshot {
    const roundSnapshot = this.roundManager.snapshot();
    return {
      phase: roundSnapshot.phase,
      roundIndex: roundSnapshot.roundIndex,
      seekerIndex: roundSnapshot.seekerIndex,
      phaseElapsedMs: roundSnapshot.phaseElapsedMs,
      phaseRemainingMs: roundSnapshot.phaseRemainingMs,
      attackCountRemaining: this.attackCountRemaining,
      players: this.players.map((player) => ({
        ...player,
        position: cloneVector2(player.position),
        facing: cloneVector2(player.facing)
      })),
      props: this.props.map((prop) => ({ ...prop, position: cloneVector2(prop.position) })),
      lastRoundResult: this.lastRoundResult
        ? {
            ...this.lastRoundResult,
            capturedHiderIds: [...this.lastRoundResult.capturedHiderIds],
            survivingHiderIds: [...this.lastRoundResult.survivingHiderIds],
            scoreDeltas: this.lastRoundResult.scoreDeltas.map((scoreDelta) => ({ ...scoreDelta }))
          }
        : null,
      matchEnded: roundSnapshot.matchEnded
    };
  }

  public setMovementInput(input: PlayerMovementInput): void {
    this.assertKnownPlayer(input.playerId);
    this.movementInputsByPlayerId.set(input.playerId, normalizeVector2(input.direction));
  }

  public clearMovementInput(playerId: string): void {
    this.assertKnownPlayer(playerId);
    this.movementInputsByPlayerId.set(playerId, ZERO_VECTOR);
  }

  public setFacingDirection(playerId: string, direction: Vector2): void {
    const player = this.getPlayer(playerId);
    player.facing = normalizeVector2(direction, player.facing);
  }

  public tick(deltaMs: number): LocalGameSnapshot {
    const safeDeltaMs = Math.max(0, deltaMs);
    this.updateMovement(safeDeltaMs);
    const enteredPhase = this.roundManager.tick(safeDeltaMs);

    if (enteredPhase) {
      if (enteredPhase === RoundPhase.Result) {
        this.scoreCurrentRound('time_up');
      }
      this.enterPhase(enteredPhase);
    }

    this.updateDisguises(safeDeltaMs);
    return this.getSnapshot();
  }

  public switchDisguise(playerId: string): boolean {
    const phase = this.roundManager.getPhase();
    if (phase !== RoundPhase.Hide && phase !== RoundPhase.Seek) {
      return false;
    }

    const player = this.getPlayer(playerId);
    return this.disguiseController.switchToNextProp(player, this.availablePropIds);
  }

  public attack(playerId: string): LocalAttackResult {
    const phase = this.roundManager.getPhase();
    if (phase !== RoundPhase.Seek) {
      return {
        accepted: false,
        reason: 'Attacks are only valid during Seek.',
        remainingAttacks: this.attackCountRemaining,
        destroyedPropIds: [],
        capturedPlayerIds: [],
        endedRound: false
      };
    }

    const seeker = this.getPlayer(playerId);
    const result = this.attackController.attack(
      seeker,
      this.players,
      this.props,
      this.attackCountRemaining,
      (player) => this.getHiderRadius(player)
    );

    if (!result.accepted) {
      return result;
    }

    this.attackCountRemaining = result.remainingAttacks;

    const allHidersCaptured = this.areAllHidersCaptured();
    if (allHidersCaptured || this.attackCountRemaining <= 0) {
      this.scoreCurrentRound(allHidersCaptured ? 'all_captured' : 'attacks_used');
      this.roundManager.enterResult();
      this.enterPhase(RoundPhase.Result);
      return { ...result, endedRound: true };
    }

    return result;
  }

  public debugForceNextPhase(): LocalGameSnapshot {
    const enteredPhase = this.roundManager.forceNextPhase();
    if (enteredPhase === RoundPhase.Result) {
      this.scoreCurrentRound('time_up');
    }
    this.enterPhase(enteredPhase);
    return this.getSnapshot();
  }

  private createPlayers(setup: LocalGameSetup): LocalPlayer[] {
    return setup.players.map((playerSetup, index) => ({
      playerId: playerSetup.playerId,
      displayName: playerSetup.displayName,
      role: index === 0 ? PlayerRole.Seeker : PlayerRole.Hider,
      state: PlayerState.InvisibleInPreview,
      score: 0,
      position: cloneVector2(playerSetup.startPosition ?? { x: 0, y: 0 }),
      facing: normalizeVector2(playerSetup.startFacing ?? RIGHT_VECTOR, RIGHT_VECTOR),
      currentPropId: playerSetup.initialPropId ?? setup.availablePropIds[0] ?? '',
      captured: false
    }));
  }

  private enterPhase(phase: RoundPhase): void {
    if (phase === RoundPhase.Preview) {
      this.prepareRound();
    }

    if (phase === RoundPhase.Seek) {
      const hiderCount = this.players.filter((player) => player.role === PlayerRole.Hider).length;
      this.attackCountRemaining = hiderCount * this.setup.gameConfig.attackCountMultiplier;
    }

    if (phase === RoundPhase.MatchEnd) {
      this.attackCountRemaining = 0;
    }

    this.updateDisguises(0);
  }

  private prepareRound(): void {
    const seekerIndex = this.roundManager.getSeekerIndex();
    this.attackCountRemaining = 0;
    this.resultScoredForRoundIndex = null;
    this.lastRoundResult = null;
    this.disguiseController.reset(this.players);
    this.props.splice(0, this.props.length, ...this.initialProps.map(clonePropInstance));

    let hiderSpawnIndex = 0;
    this.players.forEach((player, index) => {
      player.role = index === seekerIndex ? PlayerRole.Seeker : PlayerRole.Hider;
      player.captured = false;
      player.state = PlayerState.InvisibleInPreview;
      if (this.setup.seekerSpawnPoint && this.setup.spawnPoints && this.setup.spawnPoints.length > 0) {
        if (player.role === PlayerRole.Seeker) {
          player.position = cloneVector2(this.setup.seekerSpawnPoint);
          player.facing = normalizeVector2(this.setup.players[index]?.startFacing ?? RIGHT_VECTOR, RIGHT_VECTOR);
        } else {
          const spawn = this.setup.spawnPoints[hiderSpawnIndex % this.setup.spawnPoints.length] ?? this.setup.seekerSpawnPoint;
          hiderSpawnIndex += 1;
          player.position = cloneVector2(spawn);
          player.facing = normalizeVector2(this.setup.players[index]?.startFacing ?? RIGHT_VECTOR, RIGHT_VECTOR);
        }
      }
    });
  }

  private updateMovement(deltaMs: number): void {
    const phase = this.roundManager.getPhase();
    this.actualMovementByPlayerId.clear();

    for (const player of this.players) {
      this.actualMovementByPlayerId.set(player.playerId, ZERO_VECTOR);
      const input = this.movementInputsByPlayerId.get(player.playerId) ?? ZERO_VECTOR;
      const speed = this.getSpeedForPlayer(player, phase);
      if (speed <= 0 || player.captured || !isNonZeroVector(input)) {
        continue;
      }

      player.facing = normalizeVector2(input, player.facing);
      const previousPosition = cloneVector2(player.position);
      const intendedPosition = moveToward(player.position, input, speed, deltaMs);
      player.position = this.resolveMovement(player, intendedPosition, phase);
      const actualMovement = {
        x: player.position.x - previousPosition.x,
        y: player.position.y - previousPosition.y
      };
      this.actualMovementByPlayerId.set(
        player.playerId,
        isNonZeroVector(actualMovement) ? normalizeVector2(actualMovement) : ZERO_VECTOR
      );
    }
  }

  private updateDisguises(deltaMs: number): void {
    const phase = this.roundManager.getPhase();
    for (const player of this.players) {
      const actualMovement = this.actualMovementByPlayerId.get(player.playerId) ?? ZERO_VECTOR;
      this.disguiseController.updatePlayerState(player, phase, actualMovement, deltaMs);
    }
  }

  private resolveMovement(player: LocalPlayer, intendedPosition: Vector2, phase: RoundPhase): Vector2 {
    const radius = this.getCollisionRadiusForPlayer(player);
    const startPosition = cloneVector2(player.position);
    const dx = intendedPosition.x - startPosition.x;
    const dy = intendedPosition.y - startPosition.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.00001) {
      return this.clampPositionToMap(startPosition, radius);
    }

    const stepCount = Math.max(1, Math.ceil(distance / Math.max(4, radius * 0.5)));
    let currentPosition = startPosition;

    for (let step = 0; step < stepCount; step += 1) {
      const nextTarget = {
        x: currentPosition.x + dx / stepCount,
        y: currentPosition.y + dy / stepCount
      };
      const nextPosition = this.resolveMovementStep(player, currentPosition, nextTarget, phase, radius);
      if (!isNonZeroVector({ x: nextPosition.x - currentPosition.x, y: nextPosition.y - currentPosition.y })) {
        break;
      }
      currentPosition = nextPosition;
    }

    return currentPosition;
  }

  private resolveMovementStep(
    player: LocalPlayer,
    startPosition: Vector2,
    intendedPosition: Vector2,
    phase: RoundPhase,
    radius: number
  ): Vector2 {
    const desiredPosition = this.clampPositionToMap(intendedPosition, radius);
    if (!this.isMovementBlocked(player, desiredPosition, radius, phase, startPosition)) {
      return desiredPosition;
    }

    const xOnlyPosition = this.clampPositionToMap({ x: desiredPosition.x, y: startPosition.y }, radius);
    if (!this.isMovementBlocked(player, xOnlyPosition, radius, phase, startPosition)) {
      return xOnlyPosition;
    }

    const yOnlyPosition = this.clampPositionToMap({ x: startPosition.x, y: desiredPosition.y }, radius);
    if (!this.isMovementBlocked(player, yOnlyPosition, radius, phase, startPosition)) {
      return yOnlyPosition;
    }

    return startPosition;
  }

  private isMovementBlocked(
    player: LocalPlayer,
    position: Vector2,
    radius: number,
    phase: RoundPhase,
    startPosition: Vector2
  ): boolean {
    for (const prop of this.props) {
      const propCollisionRadius = getPropMovementRadius(prop.radius);
      if (prop.destroyed || prop.blocksMovement === false) {
        continue;
      }

      if (shouldBlockCircleMovement(position, radius, prop.position, propCollisionRadius, startPosition)) {
        return true;
      }
    }

    for (const obstacle of this.obstacles) {
      const collisionRect = insetCollisionRect(obstacle);
      if (obstacle.blocksMovement === false || obstacle.allowsOverlap === true) {
        continue;
      }

      if (shouldBlockRectMovement(position, radius, collisionRect, startPosition)) {
        return true;
      }
    }

    if (!doesPhaseBlockPlayerBodies(phase)) {
      return false;
    }

    for (const otherPlayer of this.players) {
      if (otherPlayer.playerId === player.playerId || otherPlayer.captured) {
        continue;
      }

      const otherRadius = this.getCollisionRadiusForPlayer(otherPlayer);
      if (shouldBlockCircleMovement(position, radius, otherPlayer.position, otherRadius, startPosition)) {
        return true;
      }
    }

    return false;
  }

  private clampPositionToMap(position: Vector2, radius: number): Vector2 {
    if (!this.setup.mapSize || this.setup.mapSize.width <= 0 || this.setup.mapSize.height <= 0) {
      return cloneVector2(position);
    }

    if (this.setup.movementBounds) {
      return clampCircleToMovementBounds(position, radius, this.setup.movementBounds);
    }

    return clampCircleToBounds(position, radius, this.setup.mapSize.width, this.setup.mapSize.height);
  }

  private getSpeedForPlayer(player: LocalPlayer, phase: RoundPhase): number {
    if (phase === RoundPhase.Hide && player.role === PlayerRole.Hider) {
      return this.setup.gameConfig.hiderHideSpeed;
    }

    if (phase === RoundPhase.Seek && player.role === PlayerRole.Seeker) {
      return this.setup.gameConfig.seekerSpeed;
    }

    if (phase === RoundPhase.Seek && player.role === PlayerRole.Hider) {
      return this.setup.gameConfig.hiderSeekSpeed;
    }

    return 0;
  }

  private scoreCurrentRound(endedReason: Parameters<ScoreManager['applyRoundScores']>[3]): void {
    const roundIndex = this.roundManager.getRoundIndex();
    if (this.resultScoredForRoundIndex === roundIndex) {
      return;
    }

    const seeker = this.players.find((player) => player.role === PlayerRole.Seeker);
    if (!seeker) {
      throw new Error('Cannot score round without a seeker.');
    }

    this.lastRoundResult = this.scoreManager.applyRoundScores(this.players, roundIndex, seeker.playerId, endedReason);
    this.resultScoredForRoundIndex = roundIndex;
  }

  private getHiderRadius(player: LocalPlayer): number {
    return this.propRadiusById.get(player.currentPropId) ?? DEFAULT_PLAYER_RADIUS_PX;
  }

  private getCollisionRadiusForPlayer(player: LocalPlayer): number {
    if (player.captured) {
      return 0;
    }

    if (player.role !== PlayerRole.Hider) {
      return PLAYER_MOVEMENT_RADIUS_PX;
    }

    return Math.max(
      MIN_HIDER_MOVEMENT_RADIUS_PX,
      Math.min(MAX_HIDER_MOVEMENT_RADIUS_PX, this.getHiderRadius(player) * 0.6)
    );
  }

  private areAllHidersCaptured(): boolean {
    const hiders = this.players.filter((player) => player.role === PlayerRole.Hider);
    return hiders.length > 0 && hiders.every((player) => player.captured);
  }

  private getPlayer(playerId: string): LocalPlayer {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (!player) {
      throw new Error(`Unknown local player: ${playerId}`);
    }

    return player;
  }

  private assertKnownPlayer(playerId: string): void {
    this.getPlayer(playerId);
  }
}

function cloneCollisionRect(rect: LocalCollisionRect): LocalCollisionRect {
  return {
    ...rect,
    position: cloneVector2(rect.position),
    size: { ...rect.size }
  };
}

function clonePropInstance(prop: LocalPropInstance): LocalPropInstance {
  return {
    ...prop,
    position: cloneVector2(prop.position)
  };
}

function getPropMovementRadius(propRadius: number): number {
  return Math.max(8, propRadius * PROP_MOVEMENT_RADIUS_SCALE);
}

function clampCircleToMovementBounds(position: Vector2, radius: number, bounds: LocalMovementBounds): Vector2 {
  const safeRadius = Math.max(0, radius);
  return {
    x: clampNumber(position.x, bounds.minX + safeRadius, bounds.maxX - safeRadius),
    y: clampNumber(position.y, bounds.minY + safeRadius, bounds.maxY - safeRadius)
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (min > max) {
    return (min + max) / 2;
  }
  return Math.max(min, Math.min(max, value));
}

function insetCollisionRect(rect: LocalCollisionRect): LocalCollisionRect {
  const insetX = Math.min(RECT_COLLISION_INSET_PX, Math.max(0, (rect.size.width - 4) / 2));
  const insetY = Math.min(RECT_COLLISION_INSET_PX, Math.max(0, (rect.size.height - 4) / 2));
  return {
    ...rect,
    position: {
      x: rect.position.x + insetX,
      y: rect.position.y + insetY
    },
    size: {
      width: rect.size.width - insetX * 2,
      height: rect.size.height - insetY * 2
    }
  };
}

function shouldBlockCircleMovement(
  position: Vector2,
  radius: number,
  blockerPosition: Vector2,
  blockerRadius: number,
  startPosition: Vector2
): boolean {
  const candidateSeparation = circleCircleSeparation(position, radius, blockerPosition, blockerRadius);
  if (candidateSeparation >= 0) {
    return false;
  }

  const startSeparation = circleCircleSeparation(startPosition, radius, blockerPosition, blockerRadius);
  if (startSeparation < 0 && candidateSeparation >= startSeparation - COLLISION_ESCAPE_EPSILON) {
    return false;
  }

  return true;
}

function shouldBlockRectMovement(
  position: Vector2,
  radius: number,
  rect: LocalCollisionRect,
  startPosition: Vector2
): boolean {
  const candidateSeparation = circleRectSeparation(position, radius, rect);
  if (candidateSeparation >= 0) {
    return false;
  }

  const startSeparation = circleRectSeparation(startPosition, radius, rect);
  if (startSeparation < 0) {
    if (isPointInsideRect(startPosition, rect) && isPointInsideRect(position, rect)) {
      return candidateSeparation <= startSeparation + COLLISION_ESCAPE_EPSILON;
    }

    return candidateSeparation < startSeparation - COLLISION_ESCAPE_EPSILON;
  }

  return true;
}

function doesPhaseBlockPlayerBodies(phase: RoundPhase): boolean {
  return phase === RoundPhase.Hide || phase === RoundPhase.Seek;
}

