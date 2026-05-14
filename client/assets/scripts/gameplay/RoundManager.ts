import { MAX_LOCAL_PLAYERS, type GameConfig, MIN_LOCAL_PLAYERS, RoundPhase } from './LocalGameTypes';

export interface RoundManagerSnapshot {
  phase: RoundPhase;
  roundIndex: number;
  seekerIndex: number;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  matchEnded: boolean;
}

export class RoundManager {
  private phase = RoundPhase.Preview;
  private roundIndex = 0;
  private seekerIndex = 0;
  private phaseElapsedMs = 0;
  private matchEnded = false;

  public constructor(
    private readonly config: GameConfig,
    private readonly playerCount: number
  ) {
    if (playerCount < MIN_LOCAL_PLAYERS || playerCount > MAX_LOCAL_PLAYERS) {
      throw new Error(`Local match requires ${MIN_LOCAL_PLAYERS} to ${MAX_LOCAL_PLAYERS} players.`);
    }
  }

  public getPhase(): RoundPhase {
    return this.phase;
  }

  public getRoundIndex(): number {
    return this.roundIndex;
  }

  public getSeekerIndex(): number {
    return this.seekerIndex;
  }

  public getPhaseElapsedMs(): number {
    return this.phaseElapsedMs;
  }

  public tick(deltaMs: number): RoundPhase | null {
    if (this.matchEnded) {
      return null;
    }

    this.phaseElapsedMs += Math.max(0, deltaMs);
    if (this.phaseElapsedMs < this.getCurrentPhaseDurationMs()) {
      return null;
    }

    return this.advancePhase();
  }

  public forceNextPhase(): RoundPhase {
    return this.advancePhase();
  }

  public enterResult(): RoundPhase {
    this.phase = RoundPhase.Result;
    this.phaseElapsedMs = 0;
    return this.phase;
  }

  public snapshot(): RoundManagerSnapshot {
    const durationMs = this.getCurrentPhaseDurationMs();
    return {
      phase: this.phase,
      roundIndex: this.roundIndex,
      seekerIndex: this.seekerIndex,
      phaseElapsedMs: this.phaseElapsedMs,
      phaseRemainingMs: Math.max(0, durationMs - this.phaseElapsedMs),
      matchEnded: this.matchEnded
    };
  }

  private advancePhase(): RoundPhase {
    if (this.phase === RoundPhase.Preview) {
      return this.setPhase(RoundPhase.Hide);
    }

    if (this.phase === RoundPhase.Hide) {
      return this.setPhase(RoundPhase.Seek);
    }

    if (this.phase === RoundPhase.Seek) {
      return this.setPhase(RoundPhase.Result);
    }

    if (this.phase === RoundPhase.Result) {
      this.roundIndex += 1;
      if (this.roundIndex >= this.playerCount) {
        this.matchEnded = true;
        return this.setPhase(RoundPhase.MatchEnd);
      }

      this.seekerIndex = this.roundIndex;
      return this.setPhase(RoundPhase.Preview);
    }

    this.matchEnded = true;
    return this.setPhase(RoundPhase.MatchEnd);
  }

  private setPhase(phase: RoundPhase): RoundPhase {
    this.phase = phase;
    this.phaseElapsedMs = 0;
    return this.phase;
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
}

