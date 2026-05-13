import { _decorator, Component } from 'cc';
import { formatCountdown } from '../core/TimeUtil';

const { ccclass } = _decorator;

export interface ScoreLineViewModel {
  playerId: string;
  displayName: string;
  score: number;
}

export type V2HintStatus = 'none' | 'available' | 'used';

export interface V2ObjectiveSummaryViewModel {
  enabled: boolean;
  label: string;
  progressText: string;
  completed: boolean;
  rewardText: string;
  hintStatus: V2HintStatus;
}

export type V2AmbientEventStatus = 'none' | 'queued' | 'active' | 'ended';

export interface V2AmbientEventSummaryViewModel {
  enabled: boolean;
  status: V2AmbientEventStatus;
  title: string;
  timeLeftMs: number | null;
  publicAreaLabel: string;
}

export interface GameHUDViewModel {
  phase: string;
  countdownMs: number;
  role: string;
  attackCountRemaining?: number | null;
  remainingAttacks: number | null;
  currentPropId: string | null;
  isCaptured?: boolean;
  currentScore?: number | null;
  capturedCount: number;
  totalHiders: number;
  scores: ScoreLineViewModel[];
  v2Objective: V2ObjectiveSummaryViewModel;
  v2AmbientEvent: V2AmbientEventSummaryViewModel;
}

export interface GameHUDDisplayState {
  phaseText: string;
  countdownText: string;
  countdownWarning: boolean;
  countdownEmphasisText: string;
  roleText: string;
  hudVariant: 'seeker' | 'hider' | 'spectator';
  objectiveText: string;
  primaryActionText: string;
  remainingAttacksText: string;
  remainingAttacksVisible: boolean;
  currentPropText: string;
  currentPropVisible: boolean;
  capturedText: string;
  capturedStatusText: string;
  capturedWarningVisible: boolean;
  currentScoreText: string;
  scoresText: string;
  v2ObjectiveVisible: boolean;
  v2ObjectiveText: string;
  v2ObjectiveProgressText: string;
  v2ObjectiveRewardText: string;
  v2ObjectiveCompletedText: string;
  v2ObjectiveHintText: string;
  v2AmbientEventVisible: boolean;
  v2AmbientEventStatusText: string;
  v2AmbientEventTitleText: string;
  v2AmbientEventTimeText: string;
  v2AmbientEventAreaText: string;
}

const EMPTY_HUD: GameHUDViewModel = {
  phase: 'preview',
  countdownMs: 0,
  role: 'hider',
  attackCountRemaining: null,
  remainingAttacks: null,
  currentPropId: null,
  isCaptured: false,
  currentScore: null,
  capturedCount: 0,
  totalHiders: 0,
  scores: [],
  v2Objective: createEmptyV2ObjectiveSummary(),
  v2AmbientEvent: createEmptyV2AmbientEventSummary()
};

const FINAL_COUNTDOWN_MS = 5000;

@ccclass('GameHUD')
export class GameHUD extends Component {
  private viewModel: GameHUDViewModel = cloneHUDViewModel(EMPTY_HUD);
  private displayState: GameHUDDisplayState = buildDisplayState(this.viewModel);

  public updateViewModel(viewModel: GameHUDViewModel): void {
    this.viewModel = cloneHUDViewModel(viewModel);
    this.displayState = buildDisplayState(this.viewModel);
  }

  public getViewModel(): GameHUDViewModel {
    return cloneHUDViewModel(this.viewModel);
  }

  public getDisplayState(): GameHUDDisplayState {
    return { ...this.displayState };
  }
}

function buildDisplayState(viewModel: GameHUDViewModel): GameHUDDisplayState {
  const attackCountRemaining = viewModel.attackCountRemaining ?? viewModel.remainingAttacks;
  const roleMode = getRoleMode(viewModel.role);
  const remainingAttacksVisible = roleMode === 'seeker';
  const currentPropVisible = roleMode === 'hider';
  const remainingAttacksText =
    remainingAttacksVisible && attackCountRemaining != null ? attackCountRemaining.toString() : '';
  const currentPropText = currentPropVisible ? formatPropName(viewModel.currentPropId) : '';
  const capturedTotal = Math.max(0, viewModel.totalHiders);
  const capturedCount = Math.max(0, viewModel.capturedCount);
  const isCaptured = Boolean(viewModel.isCaptured);
  const countdownWarning = viewModel.countdownMs > 0 && viewModel.countdownMs <= FINAL_COUNTDOWN_MS;
  const v2Objective = viewModel.v2Objective;
  const v2AmbientEvent = viewModel.v2AmbientEvent;

  return {
    phaseText: formatPhaseName(viewModel.phase),
    countdownText: formatCountdown(viewModel.countdownMs),
    countdownWarning,
    countdownEmphasisText: countdownWarning ? 'Final 5 Seconds' : '',
    roleText: formatRoleName(viewModel.role),
    hudVariant: roleMode,
    objectiveText: getObjectiveText(roleMode, isCaptured),
    primaryActionText: getPrimaryActionText(roleMode, isCaptured),
    remainingAttacksText,
    remainingAttacksVisible,
    currentPropText,
    currentPropVisible,
    capturedText: `${capturedCount}/${capturedTotal}`,
    capturedStatusText: isCaptured ? 'Captured - spectating only' : '',
    capturedWarningVisible: isCaptured,
    currentScoreText: viewModel.currentScore == null ? '' : viewModel.currentScore.toString(),
    scoresText: viewModel.scores
      .map((score) => `${score.displayName}: ${score.score}`)
      .join('\n'),
    v2ObjectiveVisible: v2Objective.enabled,
    v2ObjectiveText: v2Objective.enabled ? v2Objective.label : '',
    v2ObjectiveProgressText: v2Objective.enabled ? v2Objective.progressText : '',
    v2ObjectiveRewardText: v2Objective.enabled ? v2Objective.rewardText : '',
    v2ObjectiveCompletedText: v2Objective.enabled && v2Objective.completed ? 'Completed' : '',
    v2ObjectiveHintText: v2Objective.enabled ? formatHintStatus(v2Objective.hintStatus) : '',
    v2AmbientEventVisible: v2AmbientEvent.enabled && v2AmbientEvent.status !== 'none',
    v2AmbientEventStatusText: v2AmbientEvent.enabled ? formatV2AmbientEventStatus(v2AmbientEvent.status) : '',
    v2AmbientEventTitleText: v2AmbientEvent.enabled ? v2AmbientEvent.title : '',
    v2AmbientEventTimeText:
      v2AmbientEvent.enabled && v2AmbientEvent.timeLeftMs != null ? formatCountdown(v2AmbientEvent.timeLeftMs) : '',
    v2AmbientEventAreaText: v2AmbientEvent.enabled ? v2AmbientEvent.publicAreaLabel : ''
  };
}

function cloneHUDViewModel(viewModel: GameHUDViewModel): GameHUDViewModel {
  return {
    ...viewModel,
    attackCountRemaining: viewModel.attackCountRemaining ?? viewModel.remainingAttacks,
    isCaptured: Boolean(viewModel.isCaptured),
    currentScore: viewModel.currentScore ?? null,
    scores: viewModel.scores.map((score) => ({ ...score })),
    v2Objective: cloneV2ObjectiveSummary(viewModel.v2Objective),
    v2AmbientEvent: cloneV2AmbientEventSummary(viewModel.v2AmbientEvent)
  };
}

export function createEmptyV2ObjectiveSummary(): V2ObjectiveSummaryViewModel {
  return {
    enabled: false,
    label: '',
    progressText: '',
    completed: false,
    rewardText: '',
    hintStatus: 'none'
  };
}

export function createEmptyV2AmbientEventSummary(): V2AmbientEventSummaryViewModel {
  return {
    enabled: false,
    status: 'none',
    title: '',
    timeLeftMs: null,
    publicAreaLabel: ''
  };
}

function cloneV2ObjectiveSummary(summary: V2ObjectiveSummaryViewModel | undefined): V2ObjectiveSummaryViewModel {
  return summary ? { ...summary } : createEmptyV2ObjectiveSummary();
}

function cloneV2AmbientEventSummary(
  summary: V2AmbientEventSummaryViewModel | undefined
): V2AmbientEventSummaryViewModel {
  return summary ? { ...summary } : createEmptyV2AmbientEventSummary();
}

function getRoleMode(role: string): GameHUDDisplayState['hudVariant'] {
  if (role === 'seeker') {
    return 'seeker';
  }

  if (role === 'hider') {
    return 'hider';
  }

  return 'spectator';
}

function formatRoleName(role: string): string {
  switch (role) {
    case 'seeker':
      return 'Seeker';
    case 'hider':
      return 'Hider';
    default:
      return role;
  }
}

function formatPhaseName(phase: string): string {
  switch (phase) {
    case 'preview':
      return 'Preview';
    case 'hide':
      return 'Hide';
    case 'seek':
      return 'Seek';
    case 'result':
      return 'Result';
    case 'match_end':
      return 'Match End';
    default:
      return phase;
  }
}

function formatPropName(propId: string | null): string {
  if (!propId) {
    return '';
  }

  return propId
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function getObjectiveText(roleMode: GameHUDDisplayState['hudVariant'], isCaptured: boolean): string {
  if (isCaptured) {
    return 'You are captured. Watch the round finish.';
  }

  switch (roleMode) {
    case 'seeker':
      return 'Find hidden players with limited cone attacks.';
    case 'hider':
      return 'Blend in as a prop and survive.';
    case 'spectator':
      return 'Watch the round state.';
    default:
      return exhaustive(roleMode);
  }
}

function getPrimaryActionText(roleMode: GameHUDDisplayState['hudVariant'], isCaptured: boolean): string {
  if (isCaptured) {
    return 'Spectate';
  }

  switch (roleMode) {
    case 'seeker':
      return 'Cone Attack';
    case 'hider':
      return 'Switch Prop';
    case 'spectator':
      return '';
    default:
      return exhaustive(roleMode);
  }
}

function formatHintStatus(status: V2HintStatus): string {
  switch (status) {
    case 'available':
      return 'Hint available';
    case 'used':
      return 'Hint used';
    case 'none':
      return '';
    default:
      return exhaustiveHintStatus(status);
  }
}

function formatV2AmbientEventStatus(status: V2AmbientEventStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'active':
      return 'Active';
    case 'ended':
      return 'Ended';
    case 'none':
      return '';
    default:
      return exhaustiveAmbientEventStatus(status);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled HUD variant: ${value}`);
}

function exhaustiveHintStatus(value: never): never {
  throw new Error(`Unhandled V2 hint status: ${value}`);
}

function exhaustiveAmbientEventStatus(value: never): never {
  throw new Error(`Unhandled V2 ambient event status: ${value}`);
}
