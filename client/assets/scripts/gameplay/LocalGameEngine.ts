import {
  cloneVector2,
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
  type LocalAttackResult,
  type LocalGameSetup,
  type LocalGameSnapshot,
  type LocalPlayer,
  type LocalPropInstance,
  type PlayerMovementInput,
  PlayerRole,
  PlayerState,
  RoundPhase,
  type Vector2
} from './LocalGameTypes';
import { RoundManager } from './RoundManager';
import { ScoreManager } from './ScoreManager';
import { SeekerAttackController } from './SeekerAttackController';

export class LocalGameEngine {
  private readonly roundManager: RoundManager;
  private readonly disguiseController: DisguiseController;
  private readonly attackController: SeekerAttackController;
  private readonly scoreManager = new ScoreManager();
  private readonly movementInputsByPlayerId = new Map<string, Vector2>();
  private readonly propRadiusById = new Map<string, number>();
  private readonly availablePropIds: string[];
  private readonly players: LocalPlayer[];
  private readonly props: LocalPropInstance[];
  private attackCountRemaining = 0;
  private lastRoundResult: LocalGameSnapshot['lastRoundResult'] = null;
  private resultScoredForRoundIndex: number | null = null;

  public constructor(private readonly setup: LocalGameSetup) {
    if (setup.players.length < 2 || setup.players.length > 4) {
      throw new Error('Local Phase 01 match requires 2 to 4 players.');
    }

    if (setup.availablePropIds.length === 0) {
      throw new Error('At least one disguise prop id is required.');
    }

    this.availablePropIds = [...setup.availablePropIds];
    this.players = this.createPlayers(setup);
    this.props = setup.props?.map((prop) => ({ ...prop, position: cloneVector2(prop.position) })) ?? [];
    for (const prop of this.props) {
      this.propRadiusById.set(prop.propId, prop.radius);
    }

    this.roundManager = new RoundManager(setup.gameConfig, this.players.length);
    this.disguiseController = new DisguiseController(setup.hideIdleDisguiseMs ?? DEFAULT_HIDE_IDLE_DISGUISE_MS);
    this.attackController = new SeekerAttackController(setup.gameConfig);
    this.enterPhase(RoundPhase.Preview);
  }

  public static createPlayers(playerCount: number): LocalGameSetup['players'] {
    if (playerCount < 2 || playerCount > 4) {
      throw new Error('Local Phase 01 match requires 2 to 4 players.');
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

  public tick(deltaMs: number): LocalGameSnapshot {
    const safeDeltaMs = Math.max(0, deltaMs);
    this.updateMovement(safeDeltaMs);
    const enteredPhase = this.roundManager.tick(safeDeltaMs);

    if (enteredPhase) {
      if (enteredPhase === RoundPhase.Result) {
        this.scoreCurrentRound('timer_expired');
      }
      this.enterPhase(enteredPhase);
    }

    this.updateDisguises(safeDeltaMs);
    return this.getSnapshot();
  }

  public switchDisguise(playerId: string): boolean {
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
      this.scoreCurrentRound(allHidersCaptured ? 'all_hiders_captured' : 'attacks_depleted');
      this.roundManager.enterResult();
      this.enterPhase(RoundPhase.Result);
      return { ...result, endedRound: true };
    }

    return result;
  }

  public debugForceNextPhase(): LocalGameSnapshot {
    const enteredPhase = this.roundManager.forceNextPhase();
    if (enteredPhase === RoundPhase.Result) {
      this.scoreCurrentRound('debug_skip');
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

    this.players.forEach((player, index) => {
      player.role = index === seekerIndex ? PlayerRole.Seeker : PlayerRole.Hider;
      player.captured = false;
      player.state = PlayerState.InvisibleInPreview;
    });
  }

  private updateMovement(deltaMs: number): void {
    const phase = this.roundManager.getPhase();
    for (const player of this.players) {
      const input = this.movementInputsByPlayerId.get(player.playerId) ?? ZERO_VECTOR;
      const speed = this.getSpeedForPlayer(player, phase);
      if (speed <= 0 || player.captured || !isNonZeroVector(input)) {
        continue;
      }

      player.facing = normalizeVector2(input, player.facing);
      player.position = moveToward(player.position, input, speed, deltaMs);
    }
  }

  private updateDisguises(deltaMs: number): void {
    const phase = this.roundManager.getPhase();
    for (const player of this.players) {
      const input = this.movementInputsByPlayerId.get(player.playerId) ?? ZERO_VECTOR;
      this.disguiseController.updatePlayerState(player, phase, input, deltaMs);
    }
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

