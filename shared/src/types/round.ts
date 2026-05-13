export enum RoundPhase {
  Preview = 'preview',
  Hide = 'hide',
  Seek = 'seek',
  Result = 'result',
  MatchEnd = 'match_end',
}

export interface RoundTimerState {
  phase: RoundPhase;
  phaseStartedAtMs: number;
  phaseEndsAtMs: number;
}
