import type {
  GameEvent,
  PublicPlayerState,
  PublicPropState,
  ServerStateMessage
} from '@prop-hide-seek/shared';
import { PlayerRole, PlayerState } from '@prop-hide-seek/shared';
import {
  createEmptyV2AmbientEventSummary,
  createEmptyV2ObjectiveSummary,
  type GameHUDViewModel,
  type ScoreLineViewModel,
  type V2HintStatus,
  type V2AmbientEventStatus,
  type V2AmbientEventSummaryViewModel,
  type V2ObjectiveSummaryViewModel
} from '../ui/GameHUD';

export interface AuthoritativeStateExtras {
  attackCountRemaining?: number;
  capturedCount?: number;
  currentPropId?: string;
  totalHiders?: number;
  v2Objectives?: ServerStateMessage['v2Objectives'] | LegacyV2ObjectiveEnvelope;
  v2Events?: ServerStateMessage['v2Events'] | LegacyV2AmbientEventEnvelope;
}

export type AuthoritativeServerState =
  Omit<ServerStateMessage, 'v2Objectives' | 'v2Events'> & AuthoritativeStateExtras;

export interface InterpolatedServerState extends AuthoritativeServerState {
  interpolationAlpha: number;
}

interface TimedStateFrame {
  readonly receivedAtMs: number;
  readonly state: AuthoritativeServerState;
}

const DEFAULT_INTERPOLATION_DELAY_MS = 100;
const MAX_EVENT_HISTORY = 32;

export class RemoteGameState {
  private previousFrame: TimedStateFrame | null = null;
  private latestFrame: TimedStateFrame | null = null;
  private interpolationDelayMs = DEFAULT_INTERPOLATION_DELAY_MS;
  private readonly eventHistory: GameEvent[] = [];

  public setInterpolationDelayMs(delayMs: number): void {
    this.interpolationDelayMs = Math.max(0, delayMs);
  }

  public pushState(state: AuthoritativeServerState, receivedAtMs = Date.now()): void {
    const clonedState = cloneServerState(state);
    this.previousFrame = this.latestFrame;
    this.latestFrame = {
      receivedAtMs,
      state: clonedState
    };
    this.appendEvents(clonedState.events);
  }

  public pushGameEvent(event: GameEvent): void {
    this.appendEvents([cloneGameEvent(event)]);
  }

  public clear(): void {
    this.previousFrame = null;
    this.latestFrame = null;
    this.eventHistory.length = 0;
  }

  public hasState(): boolean {
    return this.latestFrame !== null;
  }

  public getLatestState(): AuthoritativeServerState | null {
    return this.latestFrame ? cloneServerState(this.latestFrame.state) : null;
  }

  public getPreviousState(): AuthoritativeServerState | null {
    return this.previousFrame ? cloneServerState(this.previousFrame.state) : null;
  }

  public getInterpolationAlpha(nowMs = Date.now()): number {
    if (!this.previousFrame || !this.latestFrame) {
      return this.latestFrame ? 1 : 0;
    }

    const frameDurationMs = this.latestFrame.receivedAtMs - this.previousFrame.receivedAtMs;
    if (frameDurationMs <= 0) {
      return 1;
    }

    const targetTimeMs = nowMs - this.interpolationDelayMs;
    return clamp01((targetTimeMs - this.previousFrame.receivedAtMs) / frameDurationMs);
  }

  public getCurrentState(nowMs = Date.now()): InterpolatedServerState | null {
    if (!this.latestFrame) {
      return null;
    }

    const alpha = this.getInterpolationAlpha(nowMs);
    const current = cloneServerState(this.latestFrame.state) as InterpolatedServerState;
    current.interpolationAlpha = alpha;
    current.players = this.getCurrentPlayers(nowMs);
    current.events = this.getEvents();
    return current;
  }

  public getCurrentPlayers(nowMs = Date.now()): PublicPlayerState[] {
    if (!this.latestFrame) {
      return [];
    }

    const latestPlayers = this.latestFrame.state.players;
    if (!this.previousFrame) {
      return latestPlayers.map(clonePlayerState);
    }

    const alpha = this.getInterpolationAlpha(nowMs);
    const previousById = new Map(
      this.previousFrame.state.players.map((player) => [player.playerId, player])
    );

    return latestPlayers.map((latestPlayer) => {
      const previousPlayer = previousById.get(latestPlayer.playerId);
      if (!previousPlayer) {
        return clonePlayerState(latestPlayer);
      }

      return {
        ...clonePlayerState(latestPlayer),
        position: {
          x: lerp(previousPlayer.position.x, latestPlayer.position.x, alpha),
          y: lerp(previousPlayer.position.y, latestPlayer.position.y, alpha)
        },
        facingDeg: lerpAngleDeg(previousPlayer.facingDeg, latestPlayer.facingDeg, alpha)
      };
    });
  }

  public getProps(): PublicPropState[] {
    return this.latestFrame ? this.latestFrame.state.props.map(clonePropState) : [];
  }

  public getScores(): Record<string, number> {
    return this.latestFrame ? { ...this.latestFrame.state.scores } : {};
  }

  public getEvents(): GameEvent[] {
    return this.eventHistory.map(cloneGameEvent);
  }

  public getHUDViewModel(localPlayerId?: string | null, nowMs = Date.now()): GameHUDViewModel {
    const state = this.getCurrentState(nowMs);
    if (!state) {
      return {
        phase: '',
        countdownMs: 0,
        role: '',
        attackCountRemaining: null,
        remainingAttacks: null,
        currentPropId: null,
        capturedCount: 0,
        totalHiders: 0,
        scores: [],
        v2Objective: createEmptyV2ObjectiveSummary(),
        v2AmbientEvent: createEmptyV2AmbientEventSummary()
      };
    }

    const localPlayer = localPlayerId
      ? state.players.find((player) => player.playerId === localPlayerId)
      : null;
    const totalHiders = state.totalHiders ?? state.players.filter((player) => player.role === PlayerRole.Hider).length;
    const capturedCount = state.capturedCount ?? state.players.filter((player) => (
      player.role === PlayerRole.Hider && player.state === PlayerState.Captured
    )).length;
    const attackCountRemaining = state.attackCountRemaining ?? null;

    return {
      phase: state.phase,
      countdownMs: state.timeLeftMs,
      role: localPlayer?.role ?? '',
      attackCountRemaining,
      remainingAttacks: attackCountRemaining,
      currentPropId: state.currentPropId ?? localPlayer?.currentPropId ?? null,
      capturedCount,
      totalHiders,
      scores: buildScoreLines(state),
      v2Objective: buildV2ObjectiveSummary(state, localPlayerId ?? null),
      v2AmbientEvent: buildV2AmbientEventSummary(state)
    };
  }

  private appendEvents(events: GameEvent[]): void {
    for (const event of events) {
      if (this.eventHistory.some((existingEvent) => existingEvent.id === event.id)) {
        continue;
      }

      this.eventHistory.push(cloneGameEvent(event));
    }

    if (this.eventHistory.length > MAX_EVENT_HISTORY) {
      this.eventHistory.splice(0, this.eventHistory.length - MAX_EVENT_HISTORY);
    }
  }
}

type UnknownRecord = Record<string, unknown>;
type LegacyV2ObjectiveEnvelope = UnknownRecord;
type LegacyV2AmbientEventEnvelope = UnknownRecord;

function buildV2ObjectiveSummary(
  state: AuthoritativeServerState,
  localPlayerId: string | null
): V2ObjectiveSummaryViewModel {
  if (Array.isArray(state.v2Objectives)) {
    if (state.v2Objectives.length === 0) {
      return createEmptyV2ObjectiveSummary();
    }

    const localObjective = getLocalHiderObjectiveFromArray(state.v2Objectives, localPlayerId);
    if (!localObjective) {
      return {
        ...createEmptyV2ObjectiveSummary(),
        enabled: true
      };
    }

    const completed = getServerCompleted(localObjective, state, localPlayerId);
    return {
      enabled: true,
      label: getStringField(localObjective, ['label', 'title', 'name', 'objectiveLabel']) ?? '',
      progressText: getProgressText(localObjective),
      completed,
      rewardText: getRewardText(localObjective),
      hintStatus: getHintStatus(localObjective, {})
    };
  }

  const v2Objectives = asRecord(state.v2Objectives);
  if (!v2Objectives || v2Objectives.enabled === false) {
    return createEmptyV2ObjectiveSummary();
  }

  const localObjective = getLocalHiderObjective(v2Objectives, localPlayerId);
  if (!localObjective) {
    return {
      ...createEmptyV2ObjectiveSummary(),
      enabled: Boolean(v2Objectives.enabled)
    };
  }

  const completed = getServerCompleted(localObjective, state, localPlayerId);
  return {
    enabled: true,
    label: getStringField(localObjective, ['label', 'title', 'name', 'objectiveLabel']) ?? '',
    progressText: getProgressText(localObjective),
    completed,
    rewardText: getRewardText(localObjective),
    hintStatus: getHintStatus(localObjective, v2Objectives)
  };
}

function buildV2AmbientEventSummary(state: AuthoritativeServerState): V2AmbientEventSummaryViewModel {
  if (Array.isArray(state.v2Events)) {
    if (state.v2Events.length === 0) {
      return createEmptyV2AmbientEventSummary();
    }

    const event = getPrioritizedAmbientEventFromArray(state.v2Events);
    if (!event) {
      return {
        ...createEmptyV2AmbientEventSummary(),
        enabled: true
      };
    }

    const status = getAmbientEventStatus(event, {});
    return {
      enabled: true,
      status,
      title: getStringField(event, ['title', 'label', 'name', 'eventTitle']) ?? 'Map change',
      timeLeftMs: getAmbientEventTimeLeftMs(event, state.serverTimeMs),
      publicAreaLabel: getStringField(event, ['publicAreaLabel', 'areaLabel', 'publicArea', 'areaName']) ?? 'Nearby area'
    };
  }

  const v2Events = asRecord(state.v2Events);
  if (!v2Events || v2Events.enabled === false) {
    return createEmptyV2AmbientEventSummary();
  }

  const event = getPrioritizedAmbientEvent(v2Events);
  if (!event) {
    return {
      ...createEmptyV2AmbientEventSummary(),
      enabled: Boolean(v2Events.enabled)
    };
  }

  const status = getAmbientEventStatus(event, v2Events);
  return {
    enabled: true,
    status,
    title: getStringField(event, ['title', 'label', 'name', 'eventTitle']) ?? '',
    timeLeftMs: getNumberField(event, ['timeLeftMs', 'remainingMs', 'durationLeftMs']),
    publicAreaLabel: getStringField(event, ['publicAreaLabel', 'areaLabel', 'publicArea', 'areaName']) ?? ''
  };
}

function getLocalHiderObjectiveFromArray(value: unknown[], localPlayerId: string | null): UnknownRecord | null {
  const objectives = value.map(asRecord).filter((objective): objective is UnknownRecord => objective !== null);
  if (objectives.length === 0) {
    return null;
  }

  if (localPlayerId) {
    const localCompleted = objectives.find((objective) => getStringField(objective, ['completedBy']) === localPlayerId);
    if (localCompleted) {
      return localCompleted;
    }

    const localOwned = objectives.find((objective) => matchesPlayer(objective, localPlayerId));
    if (localOwned) {
      return localOwned;
    }
  }

  return objectives.find((objective) => getBooleanField(objective, ['completed']) !== true) ?? objectives[0] ?? null;
}

function getLocalHiderObjective(v2Objectives: UnknownRecord, localPlayerId: string | null): UnknownRecord | null {
  if (!localPlayerId) {
    return asRecord(v2Objectives.localHiderObjective) ?? asRecord(v2Objectives.localObjective);
  }

  const mapContainers = ['byPlayerId', 'playerObjectives', 'objectivesByPlayerId', 'hiderObjectivesByPlayerId'];
  for (const key of mapContainers) {
    const container = asRecord(v2Objectives[key]);
    const objective = container ? asRecord(container[localPlayerId]) : null;
    if (objective) {
      return objective;
    }
  }

  const arrays = ['objectives', 'hiderObjectives', 'playerObjectives'];
  for (const key of arrays) {
    const objective = getObjectiveFromArray(v2Objectives[key], localPlayerId);
    if (objective) {
      return objective;
    }
  }

  const localObjective = asRecord(v2Objectives.localHiderObjective) ?? asRecord(v2Objectives.localObjective);
  if (localObjective && matchesPlayer(localObjective, localPlayerId)) {
    return localObjective;
  }

  return null;
}

function getObjectiveFromArray(value: unknown, localPlayerId: string): UnknownRecord | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    const objective = asRecord(item);
    if (objective && matchesPlayer(objective, localPlayerId)) {
      return objective;
    }
  }

  return null;
}

function matchesPlayer(value: UnknownRecord, localPlayerId: string): boolean {
  return ['playerId', 'hiderId', 'hiderPlayerId', 'ownerPlayerId'].some(
    (key) => value[key] === localPlayerId
  );
}

function getServerCompleted(
  objective: UnknownRecord,
  state: AuthoritativeServerState,
  localPlayerId: string | null
): boolean {
  if (objective.completed === true) {
    return true;
  }

  const status = getStringField(objective, ['status', 'state']);
  if (status === 'completed' || status === 'complete') {
    return true;
  }

  const completedBy = getStringField(objective, ['completedBy']);
  if (completedBy && (!localPlayerId || completedBy === localPlayerId)) {
    return true;
  }

  return state.events.some((event) => {
    const candidate = event as unknown as UnknownRecord;
    const eventType = getStringField(candidate, ['type']);
    const eventPlayerId = getStringField(candidate, ['playerId', 'hiderId', 'hiderPlayerId']);
    const eventObjectiveId = getStringField(candidate, ['objectiveId']);
    const objectiveId = getStringField(objective, ['objectiveId', 'id']);
    const matchesLocalPlayer = !localPlayerId || eventPlayerId === localPlayerId;
    const matchesObjective = !objectiveId || eventObjectiveId === objectiveId;
    return eventType === 'v2_objective_completed' && matchesLocalPlayer && matchesObjective;
  });
}

function getProgressText(objective: UnknownRecord): string {
  const explicit = getStringField(objective, ['progressText', 'displayProgress']);
  if (explicit != null) {
    return explicit;
  }

  const current = getNumberField(objective, ['progressMs', 'progress', 'current', 'currentMs', 'elapsedMs']);
  const target = getNumberField(objective, ['requiredHoldMs', 'target', 'required', 'requiredMs', 'targetMs']);
  if (current == null || target == null) {
    return '';
  }

  if ('progressMs' in objective || 'requiredHoldMs' in objective) {
    return `${formatSecondsValue(current)}/${formatSecondsValue(target)}s`;
  }

  return `${Math.max(0, current)}/${Math.max(0, target)}`;
}

function getRewardText(objective: UnknownRecord): string {
  const explicit = getStringField(objective, ['rewardText', 'rewardLabel']);
  if (explicit != null) {
    return explicit;
  }

  const reward = getNumberField(objective, ['reward', 'rewardScore', 'rewardPoints']);
  return reward == null ? '' : `+${reward}`;
}

function getHintStatus(objective: UnknownRecord, v2Objectives: UnknownRecord): V2HintStatus {
  const hintStatus = getStringField(objective, ['hintStatus']) ?? getStringField(v2Objectives, ['hintStatus']);
  if (hintStatus === 'used' || hintStatus === 'available' || hintStatus === 'none') {
    return hintStatus;
  }

  const hintUsed = getBooleanField(objective, ['hintUsed', 'usedHint']) ?? getBooleanField(v2Objectives, ['hintUsed']);
  if (hintUsed === true) {
    return 'used';
  }

  const hintAvailable =
    getBooleanField(objective, ['hintAvailable', 'canUseHint']) ?? getBooleanField(v2Objectives, ['hintAvailable']);
  return hintAvailable === true ? 'available' : 'none';
}

function getPrioritizedAmbientEvent(v2Events: UnknownRecord): UnknownRecord | null {
  for (const key of ['active', 'current', 'queued', 'ended', 'lastEnded']) {
    const event = asRecord(v2Events[key]);
    if (event) {
      return event;
    }
  }

  for (const status of ['active', 'queued', 'ended']) {
    const event = getAmbientEventFromArray(v2Events.events, status);
    if (event) {
      return event;
    }
  }

  return null;
}

function getPrioritizedAmbientEventFromArray(value: unknown[]): UnknownRecord | null {
  for (const status of ['active', 'hint', 'queued', 'ended']) {
    const event = getAmbientEventFromArray(value, status);
    if (event) {
      return event;
    }
  }

  return null;
}

function getAmbientEventFromArray(value: unknown, status: string): UnknownRecord | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    const event = asRecord(item);
    if (event && getStringField(event, ['status', 'state']) === status) {
      return event;
    }
  }

  return null;
}

function getAmbientEventStatus(event: UnknownRecord, v2Events: UnknownRecord): V2AmbientEventStatus {
  const status = getStringField(event, ['status', 'state']) ?? getStringField(v2Events, ['status']);
  if (status === 'hint') {
    return 'queued';
  }

  if (status === 'queued' || status === 'active' || status === 'ended') {
    return status;
  }

  if (asRecord(v2Events.active) === event || asRecord(v2Events.current) === event) {
    return 'active';
  }

  if (asRecord(v2Events.queued) === event) {
    return 'queued';
  }

  if (asRecord(v2Events.ended) === event || asRecord(v2Events.lastEnded) === event) {
    return 'ended';
  }

  return 'none';
}

function getAmbientEventTimeLeftMs(event: UnknownRecord, serverTimeMs: number): number | null {
  const explicit = getNumberField(event, ['timeLeftMs', 'remainingMs', 'durationLeftMs']);
  if (explicit != null) {
    return explicit;
  }

  const endsAtMs = getNumberField(event, ['endsAtMs']);
  if (endsAtMs == null) {
    return null;
  }

  return Math.max(0, endsAtMs - serverTimeMs);
}

function formatSecondsValue(milliseconds: number): string {
  return (Math.max(0, milliseconds) / 1000).toFixed(1);
}

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function getStringField(value: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'string') {
      return field;
    }
  }

  return null;
}

function getNumberField(value: UnknownRecord, keys: string[]): number | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'number' && Number.isFinite(field)) {
      return field;
    }
  }

  return null;
}

function getBooleanField(value: UnknownRecord, keys: string[]): boolean | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'boolean') {
      return field;
    }
  }

  return null;
}

function buildScoreLines(state: AuthoritativeServerState): ScoreLineViewModel[] {
  const playersById = new Map(state.players.map((player) => [player.playerId, player]));
  const playerIds = new Set<string>([
    ...state.players.map((player) => player.playerId),
    ...Object.keys(state.scores)
  ]);

  return [...playerIds].map((playerId) => {
    const player = playersById.get(playerId);
    return {
      playerId,
      displayName: player?.displayName ?? playerId,
      score: state.scores[playerId] ?? player?.score ?? 0
    };
  });
}

function cloneServerState(state: AuthoritativeServerState): AuthoritativeServerState {
  return {
    ...state,
    players: state.players.map(clonePlayerState),
    props: state.props.map(clonePropState),
    events: state.events.map(cloneGameEvent),
    scores: { ...state.scores }
  };
}

function clonePlayerState(player: PublicPlayerState): PublicPlayerState {
  return {
    ...player,
    position: { ...player.position }
  };
}

function clonePropState(prop: PublicPropState): PublicPropState {
  return {
    ...prop,
    position: { ...prop.position }
  };
}

function cloneGameEvent(event: GameEvent): GameEvent {
  return {
    ...event,
    ...(isScoreChangedEvent(event) ? { scores: { ...event.scores } } : {})
  } as GameEvent;
}

function isScoreChangedEvent(event: GameEvent): event is GameEvent & { scores: Record<string, number> } {
  return event.type === 'score_changed';
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function lerpAngleDeg(from: number, to: number, alpha: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + delta * alpha;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
