import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

export interface RoundScoreDeltaViewModel {
  playerId: string;
  displayName: string;
  role: string;
  delta: number;
  totalScore: number;
  captured: boolean;
}

export interface ResultPanelViewModel {
  roundIndex: number;
  seekerId: string;
  capturedCount: number;
  totalHiders: number;
  nextSeekerId?: string | null;
  matchEnded?: boolean;
  mvpTags?: string[];
  scoreDeltas: RoundScoreDeltaViewModel[];
}

export interface ResultPanelDisplayState {
  titleText: string;
  capturedText: string;
  survivorLines: string[];
  scoreLines: string[];
  rankingLines: string[];
  nextSeekerText: string;
  matchEndText: string;
  mvpTagText: string;
}

const EMPTY_RESULT: ResultPanelViewModel = {
  roundIndex: 0,
  seekerId: '',
  capturedCount: 0,
  totalHiders: 0,
  nextSeekerId: null,
  matchEnded: false,
  mvpTags: [],
  scoreDeltas: []
};

@ccclass('ResultPanel')
export class ResultPanel extends Component {
  private visible = false;
  private viewModel: ResultPanelViewModel = cloneResultViewModel(EMPTY_RESULT);
  private displayState: ResultPanelDisplayState = buildDisplayState(this.viewModel);

  public show(viewModel: ResultPanelViewModel): void {
    this.visible = true;
    this.updateViewModel(viewModel);
  }

  public hide(): void {
    this.visible = false;
  }

  public updateViewModel(viewModel: ResultPanelViewModel): void {
    this.viewModel = cloneResultViewModel(viewModel);
    this.displayState = buildDisplayState(this.viewModel);
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public getViewModel(): ResultPanelViewModel {
    return cloneResultViewModel(this.viewModel);
  }

  public getDisplayState(): ResultPanelDisplayState {
    return {
      ...this.displayState,
      survivorLines: [...this.displayState.survivorLines],
      scoreLines: [...this.displayState.scoreLines],
      rankingLines: [...this.displayState.rankingLines]
    };
  }
}

function buildDisplayState(viewModel: ResultPanelViewModel): ResultPanelDisplayState {
  const playersById = new Map(viewModel.scoreDeltas.map((score) => [score.playerId, score]));
  const seeker = playersById.get(viewModel.seekerId);
  const nextSeeker = viewModel.nextSeekerId ? playersById.get(viewModel.nextSeekerId) : null;
  const survivorLines = viewModel.scoreDeltas
    .filter((score) => score.role === 'hider' && !score.captured)
    .map((score) => `${score.displayName} survived`);
  const rankingLines = [...viewModel.scoreDeltas]
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .map((score, index) => `${index + 1}. ${score.displayName} ${score.totalScore}`);

  return {
    titleText: viewModel.matchEnded ? 'Match Result' : `Round ${viewModel.roundIndex} Result`,
    capturedText: `${seeker?.displayName ?? 'Seeker'} caught ${viewModel.capturedCount}/${viewModel.totalHiders}`,
    survivorLines,
    scoreLines: viewModel.scoreDeltas.map((score) => {
      const sign = score.delta >= 0 ? '+' : '';
      return `${score.displayName} ${sign}${score.delta} (${score.totalScore})`;
    }),
    rankingLines,
    nextSeekerText: viewModel.matchEnded
      ? ''
      : `Next Seeker: ${nextSeeker?.displayName ?? viewModel.nextSeekerId ?? 'TBD'}`,
    matchEndText: viewModel.matchEnded ? 'Final ranking' : '',
    mvpTagText: (viewModel.mvpTags ?? []).join(', ')
  };
}

function cloneResultViewModel(viewModel: ResultPanelViewModel): ResultPanelViewModel {
  return {
    ...viewModel,
    nextSeekerId: viewModel.nextSeekerId ?? null,
    matchEnded: Boolean(viewModel.matchEnded),
    mvpTags: [...(viewModel.mvpTags ?? [])],
    scoreDeltas: viewModel.scoreDeltas.map((score) => ({ ...score }))
  };
}
