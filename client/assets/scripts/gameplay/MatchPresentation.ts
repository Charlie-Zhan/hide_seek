import type { PublicPlayerState, PublicPropState, ServerStateMessage, Vector2 } from '@prop-hide-seek/shared';
import { PlayerRole, PlayerState, RoundPhase } from '@prop-hide-seek/shared';
import type { LocalGameSnapshot, LocalPropInstance } from './LocalGameTypes';

export interface MatchPresentationProp {
  instanceId: string;
  propId: string;
  position: Vector2;
  radius?: number;
  destroyed: boolean;
}

export interface MatchPresentationPlayer {
  playerId: string;
  displayName: string;
  role: PlayerRole | string;
  state: PlayerState | string;
  score: number;
  position: Vector2;
  facing: Vector2;
  currentPropId: string;
  captured: boolean;
  hidden: boolean;
  disguisedAsProp: boolean;
  survivingResultHider: boolean;
}

export interface MatchPresentationScore {
  playerId: string;
  displayName: string;
  score: number;
}

export interface MatchPresentationView {
  source: 'solo' | 'remote';
  roomId?: string;
  phase: RoundPhase;
  roundIndex: number;
  timeLeftMs: number;
  attackCountRemaining: number;
  seekerPlayerId: string;
  players: MatchPresentationPlayer[];
  props: MatchPresentationProp[];
  scores: MatchPresentationScore[];
  localPlayer: MatchPresentationPlayer | null;
  hiderCount: number;
  capturedHiderCount: number;
  isBlindSeeker: boolean;
}

export function createSoloMatchPresentation(
  snapshot: LocalGameSnapshot,
  localPlayerId: string
): MatchPresentationView {
  const players = snapshot.players.map((player) => toPresentationPlayer({
    phase: snapshot.phase,
    playerId: player.playerId,
    displayName: player.displayName,
    role: player.role,
    state: player.state,
    score: player.score,
    position: player.position,
    facing: player.facing,
    currentPropId: player.currentPropId,
    captured: player.captured
  }));
  const localPlayer = findLocalPlayer(players, localPlayerId);
  const seekerPlayerId = snapshot.players[snapshot.seekerIndex]?.playerId ?? '';
  return buildPresentationView({
    source: 'solo',
    phase: snapshot.phase,
    roundIndex: snapshot.roundIndex,
    timeLeftMs: snapshot.phaseRemainingMs,
    attackCountRemaining: snapshot.attackCountRemaining,
    seekerPlayerId,
    players,
    props: snapshot.props.map(toPresentationProp),
    scores: players.map(toPresentationScore),
    localPlayer
  });
}

export function createRemoteMatchPresentation(
  message: ServerStateMessage,
  options: {
    localPlayerId?: string | null;
    localPlayerName?: string | null;
  } = {}
): MatchPresentationView {
  const players = message.players.map((player) => toPresentationPlayer({
    phase: message.phase,
    playerId: player.playerId,
    displayName: player.displayName,
    role: player.role,
    state: player.state,
    score: message.scores[player.playerId] ?? player.score,
    position: player.position,
    facing: player.facing ?? facingFromDegrees(player.facingDeg),
    currentPropId: player.currentPropId ?? '',
    captured: player.captured === true || player.state === PlayerState.Captured
  }));
  const localPlayer = findLocalPlayer(players, options.localPlayerId, options.localPlayerName);
  return buildPresentationView({
    source: 'remote',
    roomId: message.roomId,
    phase: message.phase,
    roundIndex: message.roundIndex,
    timeLeftMs: message.timeLeftMs,
    attackCountRemaining: message.attackCountRemaining,
    seekerPlayerId: message.seekerPlayerId,
    players,
    props: message.props.map(toRemotePresentationProp),
    scores: players.map(toPresentationScore),
    localPlayer
  });
}

export function getMatchPresentationCameraFocus(view: MatchPresentationView): Vector2 | null {
  if (view.phase === RoundPhase.Preview) {
    return null;
  }
  if (view.localPlayer && !view.localPlayer.hidden) {
    return view.localPlayer.position;
  }
  return view.players.find((player) => player.playerId === view.seekerPlayerId)?.position ?? null;
}

export function isPresentationResultPhase(phase: RoundPhase | string): boolean {
  return phase === RoundPhase.Result || phase === RoundPhase.MatchEnd;
}

function buildPresentationView(input: Omit<MatchPresentationView, 'hiderCount' | 'capturedHiderCount' | 'isBlindSeeker'>): MatchPresentationView {
  const hiders = input.players.filter((player) => player.role === PlayerRole.Hider);
  const capturedHiders = hiders.filter((player) => player.captured);
  return {
    ...input,
    hiderCount: hiders.length,
    capturedHiderCount: capturedHiders.length,
    isBlindSeeker: input.localPlayer?.role === PlayerRole.Seeker && input.phase === RoundPhase.Hide
  };
}

function toPresentationPlayer(input: {
  phase: RoundPhase;
  playerId: string;
  displayName: string;
  role: PlayerRole | string;
  state: PlayerState | string;
  score: number;
  position: Vector2;
  facing: Vector2;
  currentPropId: string;
  captured: boolean;
}): MatchPresentationPlayer {
  const captured = input.captured || input.state === PlayerState.Captured;
  const hidden = input.state === PlayerState.InvisibleInPreview || input.state === PlayerState.SeekerLocked;
  const survivingResultHider = isPresentationResultPhase(input.phase) && input.role === PlayerRole.Hider && !captured;
  const disguisedAsProp = input.role === PlayerRole.Hider &&
    input.currentPropId.length > 0 &&
    input.state !== PlayerState.HiderMovingAsCharacter &&
    !captured &&
    !survivingResultHider;

  return {
    playerId: input.playerId,
    displayName: input.displayName,
    role: input.role,
    state: input.state,
    score: input.score,
    position: cloneVector(input.position),
    facing: normalizeVector(input.facing),
    currentPropId: input.currentPropId,
    captured,
    hidden,
    disguisedAsProp,
    survivingResultHider
  };
}

function toPresentationProp(prop: LocalPropInstance): MatchPresentationProp {
  return {
    instanceId: prop.instanceId,
    propId: prop.propId,
    position: cloneVector(prop.position),
    radius: prop.radius,
    destroyed: prop.destroyed
  };
}

function toRemotePresentationProp(prop: PublicPropState): MatchPresentationProp {
  return {
    instanceId: prop.propInstanceId,
    propId: prop.propConfigId,
    position: cloneVector(prop.position),
    radius: prop.radius,
    destroyed: prop.isDestroyed || prop.destroyed === true
  };
}

function toPresentationScore(player: MatchPresentationPlayer): MatchPresentationScore {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    score: player.score
  };
}

function findLocalPlayer(
  players: MatchPresentationPlayer[],
  localPlayerId?: string | null,
  localPlayerName?: string | null
): MatchPresentationPlayer | null {
  if (localPlayerId) {
    const byId = players.find((player) => player.playerId === localPlayerId);
    if (byId) {
      return byId;
    }
  }
  if (localPlayerName) {
    return players.find((player) => player.displayName === localPlayerName) ?? null;
  }
  return null;
}

function facingFromDegrees(degrees: number | undefined): Vector2 {
  const radians = ((degrees ?? 0) * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function normalizeVector(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.01) {
    return { x: 1, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function cloneVector(vector: Vector2): Vector2 {
  return { x: vector.x, y: vector.y };
}
