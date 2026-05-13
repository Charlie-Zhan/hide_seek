import {
  type LocalPlayer,
  type LocalRoundResult,
  type LocalRoundScoreDelta,
  type RoundEndReason,
  PlayerRole
} from './LocalGameTypes';

export class ScoreManager {
  public applyRoundScores(players: LocalPlayer[], roundIndex: number, seekerId: string, endedReason: RoundEndReason): LocalRoundResult {
    const hiders = players.filter((player) => player.role === PlayerRole.Hider);
    const capturedHiderIds = hiders.filter((player) => player.captured).map((player) => player.playerId);
    const survivingHiderIds = hiders.filter((player) => !player.captured).map((player) => player.playerId);
    const scoreDeltas: LocalRoundScoreDelta[] = [];

    for (const capturedHiderId of capturedHiderIds) {
      scoreDeltas.push({
        playerId: seekerId,
        delta: 1,
        reason: 'seeker_capture'
      });
    }

    if (hiders.length > 0 && capturedHiderIds.length === hiders.length) {
      scoreDeltas.push({
        playerId: seekerId,
        delta: 1,
        reason: 'seeker_all_caught_bonus'
      });
    }

    for (const survivingHiderId of survivingHiderIds) {
      scoreDeltas.push({
        playerId: survivingHiderId,
        delta: 1,
        reason: 'hider_survived'
      });
    }

    for (const scoreDelta of scoreDeltas) {
      const player = players.find((candidate) => candidate.playerId === scoreDelta.playerId);
      if (player) {
        player.score += scoreDelta.delta;
      }
    }

    return {
      roundIndex,
      seekerId,
      capturedHiderIds,
      survivingHiderIds,
      scoreDeltas,
      endedReason
    };
  }
}

