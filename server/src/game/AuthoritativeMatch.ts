import { clamp, clampVector2, cloneVector2, facingToDegrees, isNonZeroVector, isPointInSector, moveToward, normalizeVector2, RIGHT_VECTOR, ZERO_VECTOR } from './Geometry2D.js';
import { KITCHEN_01_FIXTURE } from './KitchenFixture.js';
import { SERVER_GAME_CONFIG } from './ServerGameConfig.js';
import {
  PlayerRole,
  PlayerState,
  RoundPhase,
  type GameConfig,
  type MatchEvent,
  type MatchEventPayload,
  type MatchPlayerSetup,
  type MatchSnapshot,
  type PlayerInputIntent,
  type PublicMatchPlayerState,
  type PublicMatchPropState,
  type PublicV2EventState,
  type PublicV2ObjectiveState,
  type RoundEndReason,
  type ServerMapFixture,
  type ServerPropInstance,
  type Vector2,
} from './ServerGameTypes.js';

const HIDE_IDLE_DISGUISE_MS = 250;
const DISCONNECT_GRACE_MS = 10000;

interface ServerMatchPlayer {
  readonly playerId: string;
  readonly displayName: string;
  role: PlayerRole;
  state: PlayerState;
  position: Vector2;
  facing: Vector2;
  input: Vector2;
  currentPropId: string;
  captured: boolean;
  isMoving: boolean;
  idleMs: number;
  score: number;
  connected: boolean;
  disconnectedMs: number;
}

interface ServerV2ObjectiveState {
  readonly objectiveId: string;
  readonly assignedHiderId: string;
  readonly position: Vector2;
  progressMs: number;
  completed: boolean;
  completedBy?: string;
  rewardClaimed: boolean;
}

interface ServerV2EventState {
  readonly eventId: string;
  readonly position: Vector2;
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  hintQueued: boolean;
  activeQueued: boolean;
  endedQueued: boolean;
  status: PublicV2EventState['status'];
}

export interface AuthoritativeMatchOptions {
  readonly roomId: string;
  readonly mapId?: string;
  readonly players: MatchPlayerSetup[];
  readonly config?: Partial<GameConfig>;
  readonly fixture?: ServerMapFixture;
}

export class AuthoritativeMatch {
  private readonly config: GameConfig;
  private readonly fixture: ServerMapFixture;
  private readonly players: ServerMatchPlayer[];
  private props: ServerPropInstance[];
  private phase = RoundPhase.Preview;
  private phaseElapsedMs = 0;
  private roundIndex = 0;
  private serverTick = 0;
  private nextEventSeq = 1;
  private attackCountRemaining = 0;
  private roundScored = false;
  private v2Objectives: ServerV2ObjectiveState[] = [];
  private v2Events: ServerV2EventState[] = [];
  private readonly pendingEvents: MatchEvent[] = [];

  public constructor(private readonly options: AuthoritativeMatchOptions) {
    if (options.players.length < 2 || options.players.length > 4) {
      throw new Error('Authoritative matches require 2 to 4 players.');
    }

    this.config = {
      ...SERVER_GAME_CONFIG,
      ...options.config,
    };
    this.fixture = options.fixture ?? KITCHEN_01_FIXTURE;
    this.props = cloneProps(this.fixture.props);
    this.players = options.players.map((player, index) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      role: index === 0 ? PlayerRole.Seeker : PlayerRole.Hider,
      state: PlayerState.InvisibleInPreview,
      position: cloneVector2(ZERO_VECTOR),
      facing: cloneVector2(RIGHT_VECTOR),
      input: cloneVector2(ZERO_VECTOR),
      currentPropId: this.fixture.propPool[index % this.fixture.propPool.length] ?? '',
      captured: false,
      isMoving: false,
      idleMs: 0,
      score: 0,
      connected: true,
      disconnectedMs: 0,
    }));

    this.prepareRound();
    this.enterPhase(RoundPhase.Preview);
  }

  public handleInput(playerId: string, input: PlayerInputIntent): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (player === undefined) {
      return;
    }

    player.connected = true;
    player.disconnectedMs = 0;

    const movement = normalizeVector2({
      x: sanitizeAxis(input.moveX),
      y: sanitizeAxis(input.moveY),
    });

    if (this.canAcceptMovement(player)) {
      player.input = movement;
    } else {
      player.input = cloneVector2(ZERO_VECTOR);
    }

    if (input.action === 'switch_prop') {
      this.switchProp(player);
      return;
    }

    if (input.action === 'attack') {
      this.attack(player);
    }
  }

  public tick(deltaMs: number): MatchSnapshot {
    if (this.phase === RoundPhase.MatchEnd) {
      return this.getSnapshot(true);
    }

    const safeDeltaMs = Math.max(0, deltaMs);
    this.serverTick += 1;

    const phaseBeforeDisconnectUpdate = this.phase;
    this.updateDisconnectedPlayers(safeDeltaMs);
    if (this.phase !== phaseBeforeDisconnectUpdate && isRoundTerminalForThisTick(this.phase)) {
      return this.getSnapshot(true);
    }

    this.updateMovement(safeDeltaMs);
    this.updateV2Systems(safeDeltaMs);
    this.phaseElapsedMs += safeDeltaMs;
    this.advanceExpiredPhases();

    return this.getSnapshot(true);
  }

  public getSnapshot(consumeEvents = false): MatchSnapshot {
    const events = consumeEvents ? this.pendingEvents.splice(0) : [...this.pendingEvents];
    const scores = Object.fromEntries(this.players.map((player) => [player.playerId, player.score]));

    return {
      type: 'state',
      serverTick: this.serverTick,
      roomId: this.options.roomId,
      mapId: this.fixture.mapId,
      phase: this.phase,
      roundIndex: this.roundIndex,
      seekerPlayerId: this.getSeeker()?.playerId,
      timeLeftMs: Math.max(0, this.getCurrentPhaseDurationMs() - this.phaseElapsedMs),
      attackCountRemaining: this.attackCountRemaining,
      players: this.players.map((player) => toPublicPlayer(player)),
      props: this.props.map(toPublicProp),
      events,
      v2Objectives: this.config.v2ObjectivesEnabled ? this.v2Objectives.map((objective) => toPublicV2Objective(objective, this.config)) : [],
      v2Events: this.config.v2EventsEnabled ? this.v2Events.map((event) => toPublicV2Event(event, this.config)) : [],
      scores,
      matchEnded: this.phase === RoundPhase.MatchEnd,
    };
  }

  public isEnded(): boolean {
    return this.phase === RoundPhase.MatchEnd;
  }

  public handlePlayerDisconnected(playerId: string): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (player === undefined || this.phase === RoundPhase.MatchEnd) {
      return;
    }

    player.connected = false;
    player.disconnectedMs = 0;
    player.input = cloneVector2(ZERO_VECTOR);
    player.isMoving = false;
  }

  public handlePlayerReconnected(playerId: string): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (player === undefined || this.phase === RoundPhase.MatchEnd) {
      return;
    }

    player.connected = true;
    player.disconnectedMs = 0;
  }

  private updateMovement(deltaMs: number): void {
    for (const player of this.players) {
      const speed = this.getSpeedForPlayer(player);
      const canMove = speed > 0 && !player.captured && isNonZeroVector(player.input);
      player.isMoving = canMove;

      if (canMove) {
        player.facing = normalizeVector2(player.input, player.facing);
        player.position = clampVector2(
          moveToward(player.position, player.input, speed, deltaMs),
          this.fixture.width,
          this.fixture.height
        );
      }

      this.updatePlayerState(player, deltaMs);
    }
  }

  private updateV2Systems(deltaMs: number): void {
    if (this.config.v2ObjectivesEnabled) {
      this.updateV2Objectives(deltaMs);
    }

    if (this.config.v2EventsEnabled) {
      this.updateV2Events(deltaMs);
    }
  }

  private updateV2Objectives(deltaMs: number): void {
    if (this.phase !== RoundPhase.Seek || this.v2Objectives.length === 0) {
      return;
    }

    for (const objective of this.v2Objectives) {
      if (objective.completed) {
        continue;
      }

      const hider = this.players.find((player) => player.playerId === objective.assignedHiderId);
      if (hider === undefined || hider.role !== PlayerRole.Hider || hider.captured) {
        objective.progressMs = 0;
        continue;
      }

      if (!isWithinRadius(hider.position, objective.position, this.config.v2ObjectiveRadiusPx)) {
        objective.progressMs = 0;
        continue;
      }

      objective.progressMs = Math.min(this.config.v2ObjectiveHoldMs, objective.progressMs + deltaMs);
      if (objective.progressMs < this.config.v2ObjectiveHoldMs) {
        continue;
      }

      objective.completed = true;
      objective.completedBy = hider.playerId;
      this.queueEvent({
        type: 'v2_objective_completed',
        hiderId: hider.playerId,
        objectiveId: objective.objectiveId,
        reward: this.getV2ObjectiveReward(),
      });
    }
  }

  private updateV2Events(deltaMs: number): void {
    if (this.phase !== RoundPhase.Seek || this.v2Events.length === 0) {
      return;
    }

    const phaseTimeMs = this.phaseElapsedMs + deltaMs;
    for (const event of this.v2Events) {
      if (!event.hintQueued) {
        event.hintQueued = true;
        this.queueEvent({
          type: 'v2_event_hint',
          eventId: event.eventId,
          eventType: 'local_disruption',
          startsInMs: Math.max(0, event.startsAtMs - this.phaseElapsedMs),
        });
      }

      if (!event.activeQueued && phaseTimeMs >= event.startsAtMs) {
        event.activeQueued = true;
        event.status = 'active';
        this.queueEvent({
          type: 'v2_event_active',
          eventId: event.eventId,
          eventType: 'local_disruption',
        });
      }

      if (!event.endedQueued && phaseTimeMs >= event.endsAtMs) {
        event.endedQueued = true;
        event.status = 'ended';
        this.queueEvent({
          type: 'v2_event_ended',
          eventId: event.eventId,
          eventType: 'local_disruption',
        });
      }
    }
  }

  private updatePlayerState(player: ServerMatchPlayer, deltaMs: number): void {
    if (player.captured) {
      player.state = PlayerState.Captured;
      return;
    }

    if (this.phase === RoundPhase.Preview) {
      player.state = PlayerState.InvisibleInPreview;
      player.idleMs = 0;
      return;
    }

    if (player.role === PlayerRole.Seeker) {
      player.state = this.phase === RoundPhase.Hide ? PlayerState.SeekerLocked : PlayerState.HiderMovingAsCharacter;
      player.idleMs = 0;
      return;
    }

    if (this.phase === RoundPhase.Hide) {
      if (player.isMoving) {
        player.idleMs = 0;
        player.state = PlayerState.HiderMovingAsCharacter;
        return;
      }

      player.idleMs += deltaMs;
      player.state = player.idleMs >= HIDE_IDLE_DISGUISE_MS
        ? PlayerState.HiderDisguisedIdle
        : PlayerState.HiderMovingAsCharacter;
      return;
    }

    player.state = player.isMoving
      ? PlayerState.HiderDisguisedMoving
      : PlayerState.HiderDisguisedIdle;
  }

  private advanceExpiredPhases(): void {
    for (let guard = 0; guard < 8; guard += 1) {
      const durationMs = this.getCurrentPhaseDurationMs();
      if (this.phase === RoundPhase.MatchEnd || this.phaseElapsedMs < durationMs) {
        return;
      }

      this.phaseElapsedMs -= durationMs;

      if (this.phase === RoundPhase.Preview) {
        this.enterPhase(RoundPhase.Hide);
        continue;
      }

      if (this.phase === RoundPhase.Hide) {
        this.enterPhase(RoundPhase.Seek);
        continue;
      }

      if (this.phase === RoundPhase.Seek) {
        this.endRound('time_up');
        continue;
      }

      if (this.phase === RoundPhase.Result) {
        this.advanceAfterResult();
        continue;
      }
    }
  }

  private advanceAfterResult(): void {
    if (this.roundIndex + 1 >= this.players.length) {
      this.enterPhase(RoundPhase.MatchEnd);
      return;
    }

    this.roundIndex += 1;
    this.prepareRound();
    this.enterPhase(RoundPhase.Preview);
  }

  private enterPhase(phase: RoundPhase): void {
    this.phase = phase;
    this.phaseElapsedMs = 0;
    this.players.forEach((player) => {
      player.input = cloneVector2(ZERO_VECTOR);
      player.isMoving = false;
      player.disconnectedMs = player.connected ? 0 : player.disconnectedMs;
      this.updatePlayerState(player, 0);
    });

    if (phase === RoundPhase.Seek) {
      const hiderCount = this.players.filter((player) => player.role === PlayerRole.Hider).length;
      this.attackCountRemaining = hiderCount * this.config.attackCountMultiplier;
    }

    if (phase === RoundPhase.MatchEnd) {
      this.attackCountRemaining = 0;
    }

    this.queueEvent({
      type: 'phase_changed',
      phase,
      roundIndex: this.roundIndex,
    });
  }

  private prepareRound(): void {
    this.roundScored = false;
    this.attackCountRemaining = 0;
    this.props = cloneProps(this.fixture.props);
    const seekerPlayerId = this.players[this.roundIndex]?.playerId;

    this.players.forEach((player, index) => {
      player.role = player.playerId === seekerPlayerId ? PlayerRole.Seeker : PlayerRole.Hider;
      player.captured = false;
      player.isMoving = false;
      player.idleMs = 0;
      player.input = cloneVector2(ZERO_VECTOR);
      player.currentPropId = this.fixture.propPool[index % this.fixture.propPool.length] ?? player.currentPropId;

      if (player.role === PlayerRole.Seeker) {
        player.position = cloneVector2(this.fixture.seekerSpawn);
        player.facing = normalizeVector2(this.fixture.seekerFacing, RIGHT_VECTOR);
      } else {
        const hiderIndex = this.players
          .filter((candidate) => candidate.playerId !== seekerPlayerId)
          .findIndex((candidate) => candidate.playerId === player.playerId);
        player.position = cloneVector2(this.fixture.hiderSpawns[hiderIndex] ?? this.fixture.hiderSpawns[0] ?? this.fixture.seekerSpawn);
        player.facing = cloneVector2(RIGHT_VECTOR);
      }
    });

    this.prepareV2Round();
  }

  private prepareV2Round(): void {
    this.v2Objectives = [];
    this.v2Events = [];

    if (this.config.v2ObjectivesEnabled) {
      const hiders = this.players.filter((player) => player.role === PlayerRole.Hider);
      this.v2Objectives = hiders.map((hider, index) => ({
        objectiveId: `round_${this.roundIndex}_objective_${index + 1}`,
        assignedHiderId: hider.playerId,
        position: cloneVector2(this.fixture.v2ObjectivePoints?.[index] ?? this.fixture.hiderSpawns[index] ?? hider.position),
        progressMs: 0,
        completed: false,
        rewardClaimed: false,
      }));
    }

    if (this.config.v2EventsEnabled) {
      const fallbackZone = {
        x: this.fixture.width / 2,
        y: this.fixture.height / 2,
      };
      this.v2Events = [
        {
          eventId: `round_${this.roundIndex}_event_1`,
          position: cloneVector2(this.fixture.v2EventZones?.[0] ?? fallbackZone),
          startsAtMs: this.config.v2EventStartDelayMs,
          endsAtMs: this.config.v2EventStartDelayMs + this.config.v2EventDurationMs,
          hintQueued: false,
          activeQueued: false,
          endedQueued: false,
          status: 'hint',
        },
      ];
    }
  }

  private switchProp(player: ServerMatchPlayer): void {
    if (player.role !== PlayerRole.Hider || player.captured || this.phase === RoundPhase.Preview || this.phase === RoundPhase.Result || this.phase === RoundPhase.MatchEnd) {
      return;
    }

    const currentIndex = this.fixture.propPool.indexOf(player.currentPropId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % this.fixture.propPool.length;
    player.currentPropId = this.fixture.propPool[nextIndex] ?? player.currentPropId;
  }

  private updateDisconnectedPlayers(deltaMs: number): void {
    if (this.phase === RoundPhase.Result || this.phase === RoundPhase.MatchEnd) {
      return;
    }

    for (const player of this.players) {
      if (player.connected || player.captured) {
        continue;
      }

      player.disconnectedMs += deltaMs;
      if (player.disconnectedMs < DISCONNECT_GRACE_MS) {
        continue;
      }

      if (player.role === PlayerRole.Seeker) {
        this.endRound('seeker_disconnected');
        return;
      }

      player.captured = true;
      player.state = PlayerState.Captured;
      player.input = cloneVector2(ZERO_VECTOR);
      this.queueEvent({
        type: 'hider_captured',
        hiderId: player.playerId,
        by: 'disconnect_timeout',
      });

      if (this.areAllHidersCaptured()) {
        this.endRound('all_captured');
        return;
      }
    }
  }

  private attack(player: ServerMatchPlayer): void {
    if (player.role !== PlayerRole.Seeker || player.captured || this.phase !== RoundPhase.Seek || this.attackCountRemaining <= 0) {
      return;
    }

    this.attackCountRemaining -= 1;
    this.queueEvent({
      type: 'attack',
      attackerId: player.playerId,
      x: player.position.x,
      y: player.position.y,
      facingX: player.facing.x,
      facingY: player.facing.y,
      remainingAttacks: this.attackCountRemaining,
    });

    const destroyedPropIds: string[] = [];
    for (const prop of this.props) {
      if (!prop.breakable || prop.destroyed) {
        continue;
      }

      if (isPointInSector(player.position, player.facing, prop.position, this.config.attackRadiusPx, this.config.attackSectorDeg, prop.radius)) {
        prop.destroyed = true;
        destroyedPropIds.push(prop.propInstanceId);
      }
    }

    if (destroyedPropIds.length > 0) {
      this.queueEvent({
        type: 'props_destroyed',
        propIds: destroyedPropIds,
      });
    }

    for (const hider of this.players) {
      if (hider.role !== PlayerRole.Hider || hider.captured) {
        continue;
      }

      const hiderRadius = this.fixture.propRadiusById[hider.currentPropId] ?? 18;
      if (!isPointInSector(player.position, player.facing, hider.position, this.config.attackRadiusPx, this.config.attackSectorDeg, hiderRadius)) {
        continue;
      }

      hider.captured = true;
      hider.state = PlayerState.Captured;
      hider.input = cloneVector2(ZERO_VECTOR);
      this.queueEvent({
        type: 'hider_captured',
        hiderId: hider.playerId,
        by: player.playerId,
      });
    }

    if (this.areAllHidersCaptured()) {
      this.endRound('all_captured');
      return;
    }

    if (this.attackCountRemaining <= 0) {
      this.endRound('attacks_used');
    }
  }

  private endRound(reason: RoundEndReason): void {
    if (this.roundScored) {
      return;
    }

    const seeker = this.getSeeker();
    if (seeker === undefined) {
      throw new Error('Cannot score a round without a seeker.');
    }

    const hiders = this.players.filter((player) => player.role === PlayerRole.Hider);
    const capturedHiders = hiders.filter((player) => player.captured);
    const survivingHiders = hiders.filter((player) => !player.captured);

    seeker.score += capturedHiders.length;
    if (hiders.length > 0 && capturedHiders.length === hiders.length) {
      seeker.score += 1;
    }

    for (const hider of survivingHiders) {
      hider.score += 1;
    }

    if (this.config.v2ObjectivesEnabled) {
      this.applyV2ObjectiveRewards();
    }

    this.roundScored = true;
    this.queueEvent({
      type: 'round_ended',
      roundIndex: this.roundIndex,
      reason,
    });
    this.queueEvent({
      type: 'score_changed',
      scores: Object.fromEntries(this.players.map((player) => [player.playerId, player.score])),
    });
    this.enterPhase(RoundPhase.Result);
  }

  private applyV2ObjectiveRewards(): void {
    const reward = this.getV2ObjectiveReward();
    if (reward <= 0) {
      return;
    }

    for (const objective of this.v2Objectives) {
      if (!objective.completed || objective.rewardClaimed || objective.completedBy === undefined) {
        continue;
      }

      const hider = this.players.find((player) => player.playerId === objective.completedBy && player.role === PlayerRole.Hider && !player.captured);
      if (hider === undefined) {
        continue;
      }

      hider.score += reward;
      objective.rewardClaimed = true;
    }
  }

  private getV2ObjectiveReward(): number {
    return clamp(Math.trunc(this.config.v2ObjectiveRewardScore), 0, 1);
  }

  private canAcceptMovement(player: ServerMatchPlayer): boolean {
    if (player.captured || this.phase === RoundPhase.Preview || this.phase === RoundPhase.Result || this.phase === RoundPhase.MatchEnd) {
      return false;
    }

    if (this.phase === RoundPhase.Hide) {
      return player.role === PlayerRole.Hider;
    }

    return this.phase === RoundPhase.Seek;
  }

  private getSpeedForPlayer(player: ServerMatchPlayer): number {
    if (this.phase === RoundPhase.Hide && player.role === PlayerRole.Hider) {
      return this.config.hiderHideSpeed;
    }

    if (this.phase === RoundPhase.Seek && player.role === PlayerRole.Seeker) {
      return this.config.seekerSpeed;
    }

    if (this.phase === RoundPhase.Seek && player.role === PlayerRole.Hider) {
      return this.config.hiderSeekSpeed;
    }

    return 0;
  }

  private getCurrentPhaseDurationMs(): number {
    if (this.phase === RoundPhase.Preview) {
      return this.config.previewDurationMs;
    }

    if (this.phase === RoundPhase.Hide) {
      return this.config.hideDurationMs;
    }

    if (this.phase === RoundPhase.Seek) {
      return this.config.seekDurationMs;
    }

    if (this.phase === RoundPhase.Result) {
      return this.config.resultDurationMs;
    }

    return Number.POSITIVE_INFINITY;
  }

  private areAllHidersCaptured(): boolean {
    const hiders = this.players.filter((player) => player.role === PlayerRole.Hider);
    return hiders.length > 0 && hiders.every((player) => player.captured);
  }

  private getSeeker(): ServerMatchPlayer | undefined {
    return this.players.find((player) => player.role === PlayerRole.Seeker);
  }

  private queueEvent(event: MatchEventPayload): void {
    this.pendingEvents.push({
      ...event,
      id: `${this.options.roomId}:${this.serverTick}:${this.nextEventSeq}`,
      serverTimeMs: Date.now(),
    });
    this.nextEventSeq += 1;
  }
}

function sanitizeAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return clamp(value, -1, 1);
}

function toPublicPlayer(player: ServerMatchPlayer): PublicMatchPlayerState {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    role: player.role,
    state: player.state,
    position: cloneVector2(player.position),
    facing: cloneVector2(player.facing),
    facingDeg: facingToDegrees(player.facing),
    currentPropId: player.role === PlayerRole.Hider ? player.currentPropId : undefined,
    captured: player.captured,
    isMoving: player.isMoving,
    score: player.score,
    connected: player.connected,
  };
}

function isRoundTerminalForThisTick(phase: RoundPhase): boolean {
  return phase === RoundPhase.Result || phase === RoundPhase.MatchEnd;
}

export function redactSnapshotForPlayer(snapshot: MatchSnapshot, recipientPlayerId: string): MatchSnapshot {
  if (snapshot.phase === RoundPhase.Preview) {
    return {
      ...snapshot,
      players: snapshot.players.map(redactPlayerForHiddenPhase),
    };
  }

  const recipient = snapshot.players.find((player) => player.playerId === recipientPlayerId);
  if (snapshot.phase === RoundPhase.Hide && recipient?.role === PlayerRole.Seeker) {
    return {
      ...snapshot,
      props: [],
      players: snapshot.players.map(redactPlayerForHiddenPhase),
    };
  }

  return snapshot;
}

function redactPlayerForHiddenPhase(player: PublicMatchPlayerState): PublicMatchPlayerState {
  return {
    ...player,
    position: cloneVector2(ZERO_VECTOR),
    facing: cloneVector2(RIGHT_VECTOR),
    facingDeg: 0,
    currentPropId: undefined,
    captured: false,
    isMoving: false,
  };
}

function toPublicProp(prop: ServerPropInstance): PublicMatchPropState {
  return {
    propInstanceId: prop.propInstanceId,
    propConfigId: prop.propConfigId,
    position: cloneVector2(prop.position),
    rotationDeg: 0,
    isDestroyed: prop.destroyed,
  };
}

function toPublicV2Objective(objective: ServerV2ObjectiveState, config: GameConfig): PublicV2ObjectiveState {
  return {
    objectiveId: objective.objectiveId,
    objectiveType: 'hold_point',
    position: cloneVector2(objective.position),
    radius: config.v2ObjectiveRadiusPx,
    requiredHoldMs: config.v2ObjectiveHoldMs,
    progressMs: objective.progressMs,
    completed: objective.completed,
    completedBy: objective.completedBy,
    reward: clamp(Math.trunc(config.v2ObjectiveRewardScore), 0, 1),
  };
}

function toPublicV2Event(event: ServerV2EventState, config: GameConfig): PublicV2EventState {
  return {
    eventId: event.eventId,
    eventType: 'local_disruption',
    status: event.status,
    position: cloneVector2(event.position),
    radius: config.v2EventRadiusPx,
    startsAtMs: event.startsAtMs,
    endsAtMs: event.endsAtMs,
  };
}

function cloneProps(props: ServerPropInstance[]): ServerPropInstance[] {
  return props.map((prop) => ({
    ...prop,
    position: cloneVector2(prop.position),
  }));
}

function isWithinRadius(a: Vector2, b: Vector2, radius: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= radius * radius;
}
