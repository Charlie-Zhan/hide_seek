import {
  _decorator,
  Button,
  Color,
  Component,
  Director,
  director,
  EditBox,
  Graphics,
  JsonAsset,
  Label,
  Mask,
  Node,
  resources,
  Size,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3
} from 'cc';
import type { GameConfig, ServerStateMessage } from '@prop-hide-seek/shared';
import { appEventBus } from './EventBus';
import { GameConstants, ResourcePath, SceneName } from './GameConstants';
import { Logger } from './Logger';
import { SceneLoader } from './SceneLoader';
import { sessionState } from './SessionState';
import { MessageRouter } from '../network/MessageRouter';
import { roomNetworkClient } from '../network/NetworkClient';
import {
  TouchInputAdapter,
  createLandscapeControlLayout,
  type ScreenSafeArea,
  type TouchPoint
} from '../input/TouchInputAdapter';
import { LocalGameEngine } from '../gameplay/LocalGameEngine';
import { createLocalGameSetupFromMap } from '../gameplay/LocalGameMapAdapter';
import {
  createRemoteMatchPresentation,
  createSoloMatchPresentation,
  getMatchPresentationCameraFocus,
  isPresentationResultPhase,
  type MatchPresentationPlayer,
  type MatchPresentationProp,
  type MatchPresentationView
} from '../gameplay/MatchPresentation';
import { SoloComputerSeekerController } from '../gameplay/SoloComputerSeekerController';
import { RoundPhase, type LocalGameSnapshot } from '../gameplay/LocalGameTypes';
import { MapManager, type LoadedMapState, type LocalMapConfigInput, type LoadedMapVolumeState } from '../map/MapManager';
import { GameHUD } from '../ui/GameHUD';
import { LobbyUI } from '../ui/LobbyUI';
import { ResultPanel } from '../ui/ResultPanel';
import { RoomUI } from '../ui/RoomUI';

const { ccclass } = _decorator;
const runtimeLogger = new Logger('RuntimeSceneBridge');
const SOLO_PLAYER_ID = 'solo_player_1';
const MAP_VIEW_WIDTH = 920;
const MAP_VIEW_HEIGHT = 518;
const MAP_WORLD_WIDTH = 1440;
const MAP_WORLD_HEIGHT = 810;
const MAP_WORLD_SCALE = MAP_VIEW_WIDTH / MAP_WORLD_WIDTH;
const PREVIEW_MAP_PADDING = 0;
const CAT_SKINS = ['cat_orange_tabby', 'cat_gray_tuxedo', 'cat_calico', 'cat_black', 'cat_siamese'] as const;
const PROP_RENDER_RADIUS_BY_ID: Record<string, number> = {
  wooden_crate: 18,
  trash_bin: 17,
  plant_pot: 16,
  chair: 16,
  water_bucket: 14,
  food_basket: 16
};
const CAT_TOKEN_WIDTH = 46;
const CAT_TOKEN_HEIGHT = 42;
const spriteFrameCache = new Map<string, SpriteFrame | null>();
const spriteFrameCallbacks = new Map<string, Array<(spriteFrame: SpriteFrame) => void>>();

interface WorldQuadPoint {
  x: number;
  y: number;
}

interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlayerVisualEffect {
  attackUntil: number;
  revealUntil: number;
  dizzyUntil: number;
  movingUntil: number;
  attackFacing: { x: number; y: number } | null;
  lastX: number | null;
  lastY: number | null;
}

installRuntimeSceneBridge();

@ccclass('App')
export class App extends Component {
  private readonly logger = new Logger('App');
  private readonly sceneLoader = new SceneLoader();
  private gameConfig: GameConfig | null = null;

  protected override start(): void {
    this.logger.info('Bootstrapping client foundation.', {
      projectName: GameConstants.projectName
    });

    this.loadGameConfig();
  }

  public getLoadedGameConfig(): GameConfig | null {
    return this.gameConfig;
  }

  private loadGameConfig(): void {
    resources.load(ResourcePath.GameConfig, JsonAsset, (error, asset) => {
      if (error || !asset) {
        this.logger.error('Failed to load game_config.json.', {
          error: error?.message ?? 'Missing JsonAsset'
        });
        return;
      }

      this.gameConfig = asset.json as GameConfig;
      this.logger.info('Loaded game_config.json.', this.gameConfig);
      appEventBus.emit('game_config_loaded', this.gameConfig);
      this.sceneLoader.load(GameConstants.defaultBootTarget);
    });
  }
}

function installRuntimeSceneBridge(): void {
  const runtime = globalThis as { __propHideSeekRuntimeBridgeInstalled?: boolean };
  if (runtime.__propHideSeekRuntimeBridgeInstalled) {
    return;
  }

  const bridgeDirector = director as unknown as RuntimeDirector;
  if (typeof bridgeDirector.on !== 'function') {
    return;
  }

  runtime.__propHideSeekRuntimeBridgeInstalled = true;
  bridgeDirector.on(Director.EVENT_AFTER_SCENE_LAUNCH, mountCurrentScene);
  runtimeLogger.info('Runtime scene bridge installed.');
  scheduleMountRetries();
}

function scheduleMountRetries(): void {
  for (const delayMs of [0, 50, 150, 350, 750, 1500, 3000]) {
    setTimeout(mountCurrentScene, delayMs);
  }
}

function mountCurrentScene(): void {
  const bridgeDirector = director as unknown as RuntimeDirector;
  const scene = bridgeDirector.getScene?.();
  const sceneName = getRuntimeNodeName(scene);
  if (!scene || !sceneName) {
    runtimeLogger.info('Runtime mount skipped; scene is not ready yet.');
    return;
  }

  const canvas = ensureCanvas(scene);
  if (!canvas || canvas.getChildByName('RuntimeSceneRoot')) {
    if (!canvas) {
      runtimeLogger.error('Runtime mount skipped; Canvas is unavailable.', { sceneName });
    }
    return;
  }

  runtimeLogger.info(`Mounting runtime UI for ${sceneName}.`);
  if (sceneName === 'Lobby') {
    mountLobby(canvas);
    return;
  }

  if (sceneName === 'Room') {
    mountRoom(canvas);
    return;
  }

  if (sceneName === 'Game') {
    mountGame(canvas);
    return;
  }

  runtimeLogger.info(`No runtime UI registered for scene ${sceneName}.`);
}

function mountLobby(canvas: Node): void {
  const logic = canvas.addComponent(LobbyUI);
  const root = createRoot(canvas);
  addPanel(root, 960, 640, new Color(21, 28, 36, 255));

  const title = addLabel(root, 'Prop Hide & Seek', 0, 245, 36, new Color(248, 250, 252, 255), 820, 46);
  const subtitle = addLabel(root, '', 0, 205, 18, new Color(148, 163, 184, 255), 820, 34);
  const playerInput = addEditBox(root, 'Player name', '', -220, 146, 240, 46);
  const roomInput = addEditBox(root, 'Room code', '', 82, 146, 180, 46);
  const serverInput = addEditBox(root, 'ws://server:8787', '', 0, 86, 544, 46);
  const soloCount = addLabel(root, '', 0, -26, 18, new Color(226, 232, 240, 255), 300, 34);
  const status = addLabel(root, '', 0, -128, 18, new Color(203, 213, 225, 255), 760, 30);
  const error = addLabel(root, '', 0, -164, 18, new Color(248, 113, 113, 255), 760, 30);
  const guide = addLabel(root, '', 0, -236, 18, new Color(203, 213, 225, 255), 820, 72);

  const render = () => {
    const state = logic.getDisplayState();
    title.string = state.titleText;
    subtitle.string = state.subtitleText;
    if (!playerInput.string) {
      playerInput.string = state.playerNameText || 'Player';
    }
    if (!serverInput.string) {
      serverInput.string = state.serverUrlText;
    }
    status.string = `Network: ${state.connectionStatusText} | Server: ${state.serverUrlText}`;
    error.string = state.errorText;
    guide.string = state.gameplaySummaryLines.join('\n');
    soloCount.string = state.soloComputerCountText;
  };

  addButton(root, 'Create Room', -150, 30, 240, 48, () => {
    logic.setPlayerName(playerInput.string);
    logic.setServerUrl(logic.getDisplayState().serverUrlText);
    logic.createRoom();
    render();
  });
  addButton(root, 'Join Room', 150, 30, 220, 48, () => {
    logic.setPlayerName(playerInput.string);
    logic.setJoinRoomId(roomInput.string);
    logic.setServerUrl(logic.getDisplayState().serverUrlText);
    logic.joinRoom();
    render();
  });
  addButton(root, '-', -185, -26, 54, 40, () => {
    logic.adjustSoloComputerCount(-1);
    render();
  });
  addButton(root, '+', 185, -26, 54, 40, () => {
    logic.adjustSoloComputerCount(1);
    render();
  });
  addButton(root, 'Solo Match', 0, -82, 260, 48, () => {
    logic.setPlayerName(playerInput.string);
    logic.startSoloMode();
    render();
  });

  render();
  const timer = setInterval(render, 250);
  addDestroyCleanup(canvas, () => clearInterval(timer));
}

function mountRoom(canvas: Node): void {
  const logic = canvas.addComponent(RoomUI);
  const root = createRoot(canvas);
  addPanel(root, 960, 640, new Color(18, 24, 32, 255));

  const title = addLabel(root, 'Room', 0, 246, 34, new Color(248, 250, 252, 255), 820, 44);
  const room = addLabel(root, '', 0, 196, 24, new Color(226, 232, 240, 255), 820, 38);
  const summary = addLabel(root, '', 0, 154, 18, new Color(148, 163, 184, 255), 820, 30);
  const players = addLabel(root, '', 0, 54, 18, new Color(203, 213, 225, 255), 820, 130);
  const status = addLabel(root, '', 0, -190, 18, new Color(203, 213, 225, 255), 760, 30);
  const error = addLabel(root, '', 0, -226, 18, new Color(248, 113, 113, 255), 760, 30);
  const testPlayerButton = addButton(root, 'Test Player', 0, -128, 170, 40, () => {
    logic.addDevTestPlayer();
    render();
  });

  const render = () => {
    const state = logic.getDisplayState();
    title.string = state.titleText;
    room.string = state.roomCodeText ? `Room ${state.roomCodeText}` : 'No room';
    summary.string = `${state.playerCountText} | ${state.readinessSummaryText}`;
    players.string = state.playerList
      .map((player) => {
        const owner = player.ownerText ? ` | ${player.ownerText}` : '';
        return `${player.nameText}: ${player.readyText}, ${player.connectionText}${owner}`;
      })
      .join('\n');
    status.string = state.networkStatusText;
    error.string = state.errorText;
    testPlayerButton.active = state.canAddDevTestPlayer;
  };

  addButton(root, 'Ready', -245, -78, 130, 46, () => {
    logic.setReady(logic.getDisplayState().readyButtonText === 'Ready');
    render();
  });
  addButton(root, 'Start', -80, -78, 130, 46, () => {
    logic.startMatch();
    render();
  });
  addButton(root, 'Share', 85, -78, 130, 46, () => {
    logic.shareRoom();
    render();
  });
  addButton(root, 'Back', 250, -78, 130, 46, () => {
    logic.leaveRoom();
  });

  render();
  const timer = setInterval(render, 250);
  addDestroyCleanup(canvas, () => clearInterval(timer));
}

function mountGame(canvas: Node): void {
  if (sessionState.isSoloMode()) {
    mountSoloGame(canvas);
    return;
  }

  const root = createRoot(canvas);
  const hud = canvas.addComponent(GameHUD);
  const resultPanel = canvas.addComponent(ResultPanel);
  const mapRoot = createNode('RuntimeMapRoot', MAP_VIEW_WIDTH, MAP_VIEW_HEIGHT);
  const mapWorldRoot = createNode('RuntimeMapWorldRoot', MAP_WORLD_WIDTH * MAP_WORLD_SCALE, MAP_WORLD_HEIGHT * MAP_WORLD_SCALE);
  const mapForegroundRoot = createNode('RuntimeMapForegroundRoot', MAP_WORLD_WIDTH * MAP_WORLD_SCALE, MAP_WORLD_HEIGHT * MAP_WORLD_SCALE);
  const propNodes = new Map<string, Node>();
  const playerNodes = new Map<string, RuntimeActorNode>();
  const playerVisualEffects = new Map<string, PlayerVisualEffect>();
  let mapForegroundAttached = false;
  let loadedMapState: LoadedMapState | null = null;
  let lastNonResultScores = new Map<string, number>();
  const inputState = {
    seq: 0,
    moveX: 0,
    moveY: 0,
    latestState: null as ServerStateMessage | null
  };
  const router = new MessageRouter(roomNetworkClient, {
    onRoomUpdated: (message) => {
      if (message.room.status === 'waiting') {
        new SceneLoader().load(SceneName.Room);
      }
    },
    onState: (message) => {
      for (const event of message.events ?? []) {
        applyServerVisualEvent(event);
      }
      renderState(message);
    },
    onGameEvent: (message) => {
      eventLabel.string = `Event: ${message.event.type}`;
      applyServerVisualEvent(message.event);
      renderLatestServerState();
    },
    onError: (message) => {
      eventLabel.string = `Error: ${message.message}`;
    }
  });

  addPanel(root, 960, 640, new Color(15, 23, 42, 255));
  addLabel(root, 'Prop Hide & Seek', 0, 272, 28, new Color(248, 250, 252, 255), 820, 38);
  const stateLabel = addLabel(root, 'Waiting for server state...', 0, 236, 18, new Color(226, 232, 240, 255), 840, 32);
  mapRoot.setPosition(new Vec3(0, 30, 0));
  root.addChild(mapRoot);
  inheritLayer(mapRoot, root);
  addViewportPanel(mapRoot, MAP_VIEW_WIDTH, MAP_VIEW_HEIGHT, new Color(30, 41, 59, 255));
  mapRoot.addChild(mapWorldRoot);
  inheritLayer(mapWorldRoot, mapRoot);
  const mapSceneryRoot = createNode('RuntimeGameMapScenery', MAP_WORLD_WIDTH * MAP_WORLD_SCALE, MAP_WORLD_HEIGHT * MAP_WORLD_SCALE);
  mapWorldRoot.addChild(mapSceneryRoot);
  inheritLayer(mapSceneryRoot, mapWorldRoot);
  renderMapSceneryFromResource(mapSceneryRoot, (mapState) => {
    loadedMapState = mapState;
    renderKitchenForeground(mapForegroundRoot, mapState);
  });
  const blindLabel = addLabel(root, '', 0, 30, 26, new Color(226, 232, 240, 255), 760, 58);
  const hudLabel = addLabel(root, '', 0, -178, 16, new Color(203, 213, 225, 255), 840, 56);
  const playersLabel = addLabel(root, '', 0, -242, 15, new Color(203, 213, 225, 255), 840, 72);
  const eventLabel = addLabel(root, '', 0, -292, 15, new Color(147, 197, 253, 255), 840, 28);
  const touchLabel = addLabel(root, '', 0, -148, 14, new Color(148, 163, 184, 255), 840, 24);
  const resultRoot = createNode('RuntimeResultRoot', 760, 420);
  resultRoot.setPosition(new Vec3(0, -8, 0));
  root.addChild(resultRoot);
  inheritLayer(resultRoot, root);
  addPanel(resultRoot, 760, 420, new Color(15, 23, 42, 245));
  const resultTitle = addLabel(resultRoot, '', 0, 150, 28, new Color(248, 250, 252, 255), 700, 38);
  const resultCaptured = addLabel(resultRoot, '', 0, 104, 20, new Color(226, 232, 240, 255), 700, 32);
  const resultScores = addLabel(resultRoot, '', -170, 8, 17, new Color(203, 213, 225, 255), 320, 150);
  const resultRanking = addLabel(resultRoot, '', 190, 8, 17, new Color(203, 213, 225, 255), 320, 150);
  const resultNext = addLabel(resultRoot, '', 0, -106, 18, new Color(147, 197, 253, 255), 700, 30);
  const resultStatus = addLabel(resultRoot, '', 0, -150, 16, new Color(248, 113, 113, 255), 700, 28);
  const restartButton = addButton(resultRoot, 'Restart Room', -88, -190, 170, 42, () => {
    resultPanel.restartRoom();
    renderResultPanel();
  });
  const roomButton = addButton(resultRoot, 'Room', 110, -190, 130, 42, () => {
    new SceneLoader().load(SceneName.Room);
  });
  resultRoot.active = false;

  addButton(root, 'Up', -372, -230, 70, 40, () => setMove(0, -1));
  addButton(root, 'UL', -446, -230, 54, 40, () => setMove(-1, -1));
  addButton(root, 'UR', -298, -230, 54, 40, () => setMove(1, -1));
  addButton(root, 'Left', -446, -276, 70, 40, () => setMove(-1, 0));
  addButton(root, 'Stop', -372, -276, 70, 40, () => setMove(0, 0));
  addButton(root, 'Right', -298, -276, 70, 40, () => setMove(1, 0));
  addButton(root, 'Down', -372, -322, 70, 40, () => setMove(0, 1));
  addButton(root, 'DL', -446, -322, 54, 40, () => setMove(-1, 1));
  addButton(root, 'DR', -298, -322, 54, 40, () => setMove(1, 1));
  const actionLabel = addLabel(root, 'Action', 372, -280, 16, new Color(226, 232, 240, 255), 170, 28);
  addButton(root, 'Action', 372, -320, 130, 46, () => stopThenSendAction());
  const touchInputCleanup = installWeChatGameTouchInput(setMove, stopThenSendAction);
  touchLabel.string = touchInputCleanup
    ? 'Touch controls active: left move, right action'
    : 'Button controls active';

  function applyServerVisualEvent(event: ServerStateMessage['events'][number]): void {
    if (event.type === 'attack') {
      const effect = getOrCreatePlayerVisualEffect(playerVisualEffects, event.attackerId);
      effect.attackUntil = Date.now() + 480;
      effect.attackFacing = normalizeFacingForVisuals({ x: event.facingX, y: event.facingY });
    }
    if (event.type === 'hider_captured') {
      const hiderId = event.hiderId ?? event.hiderPlayerId;
      if (hiderId) {
        const effect = getOrCreatePlayerVisualEffect(playerVisualEffects, hiderId);
        effect.revealUntil = Date.now() + 700;
        effect.dizzyUntil = Date.now() + 2600;
      }
    }
  }

  function renderState(message: ServerStateMessage): void {
    inputState.latestState = message;
    const view = createRemoteMatchPresentation(message, {
      localPlayerId: sessionState.getPlayerId(),
      localPlayerName: sessionState.getPlayerName()
    });
    const countdownSeconds = Math.ceil(Math.max(0, view.timeLeftMs) / 1000);
    const localPlayer = view.localPlayer;
    hud.updateViewModel({
      phase: view.phase,
      countdownMs: view.timeLeftMs,
      role: localPlayer?.role ?? '',
      attackCountRemaining: view.attackCountRemaining,
      remainingAttacks: view.attackCountRemaining,
      currentPropId: localPlayer?.currentPropId ?? null,
      isCaptured: localPlayer?.captured ?? false,
      capturedCount: view.capturedHiderCount,
      totalHiders: view.hiderCount,
      scores: view.scores,
      v2Objective: { enabled: false, label: '', progressText: '', completed: false, rewardText: '', hintStatus: 'none' },
      v2AmbientEvent: { enabled: false, status: 'none', title: '', timeLeftMs: null, publicAreaLabel: '' }
    });
    const display = hud.getDisplayState();
    stateLabel.string = `Room ${view.roomId ?? message.roomId} | ${display.phaseText} | ${countdownSeconds}s | round ${view.roundIndex + 1}`;
    hudLabel.string = `You: ${localPlayer?.role ?? 'spectator'} | Captured ${display.capturedText} | Attacks ${view.attackCountRemaining} | Move ${inputState.moveX},${inputState.moveY}`;
    playersLabel.string = view.players
      .map((player) => {
        return `${player.displayName}: ${player.role}, ${player.state}, score ${player.score}`;
      })
      .join('\n');
    actionLabel.string = localPlayer?.role === 'seeker' ? 'Cone Attack' : 'Switch Prop';
    mapRoot.active = !view.isBlindSeeker;
    blindLabel.string = view.isBlindSeeker ? 'Hiders are arranging the scene' : '';
    renderMatchProps(mapWorldRoot, propNodes, view.props);
    renderMatchPlayers(mapWorldRoot, playerNodes, playerVisualEffects, view);
    mapForegroundAttached = attachKitchenForegroundLayer(mapWorldRoot, mapForegroundRoot, loadedMapState, mapForegroundAttached);
    updateMapCamera(mapWorldRoot, getMatchPresentationCameraFocus(view));

    if (isPresentationResultPhase(view.phase)) {
      showResult(message);
    } else {
      resultRoot.active = false;
      resultPanel.hide();
      lastNonResultScores = new Map(Object.entries(message.scores));
    }
  }

  function setMove(moveX: number, moveY: number): void {
    inputState.moveX = moveX;
    inputState.moveY = moveY;
    sendInput();
  }

  function sendAction(): void {
    const localPlayer = getCurrentRemoteLocalPlayer();
    const action = localPlayer?.role === 'seeker' ? 'attack' : 'switch_prop';
    if (action === 'attack' && localPlayer) {
      triggerLocalAttackVisual(localPlayer);
    }
    sendInput(action);
    renderLatestServerState();
  }

  function stopThenSendAction(): void {
    inputState.moveX = 0;
    inputState.moveY = 0;
    sendAction();
  }

  function sendInput(action?: 'attack' | 'switch_prop'): void {
    inputState.seq += 1;
    roomNetworkClient.send({
      type: 'player_input',
      seq: inputState.seq,
      moveX: inputState.moveX,
      moveY: inputState.moveY,
      action
    });
  }

  function getCurrentRemoteLocalPlayer(): MatchPresentationPlayer | null {
    if (!inputState.latestState) {
      return null;
    }
    return createRemoteMatchPresentation(inputState.latestState, {
      localPlayerId: sessionState.getPlayerId(),
      localPlayerName: sessionState.getPlayerName()
    }).localPlayer;
  }

  function triggerLocalAttackVisual(player: MatchPresentationPlayer): void {
    const effect = getOrCreatePlayerVisualEffect(playerVisualEffects, player.playerId);
    effect.attackUntil = Date.now() + 480;
    effect.attackFacing = normalizeFacingForVisuals(player.facing);
  }

  function renderLatestServerState(): void {
    if (inputState.latestState) {
      renderState(inputState.latestState);
    }
  }

  function showResult(message: ServerStateMessage): void {
    const hiders = message.players.filter((player) => player.role === 'hider');
    const capturedHiders = hiders.filter((player) => player.state === 'captured' || player.captured === true);
    const nextSeeker = message.players[message.roundIndex + 1]?.playerId ?? null;
    const resultViewModel = {
      roundIndex: message.roundIndex + 1,
      seekerId: message.seekerPlayerId,
      capturedCount: capturedHiders.length,
      totalHiders: hiders.length,
      nextSeekerId: message.phase === 'match_end' ? null : nextSeeker,
      matchEnded: message.phase === 'match_end',
      scoreDeltas: message.players.map((player) => {
        const totalScore = message.scores[player.playerId] ?? player.score;
        return {
          playerId: player.playerId,
          displayName: player.displayName,
          role: player.role,
          delta: totalScore - (lastNonResultScores.get(player.playerId) ?? 0),
          totalScore,
          captured: player.state === 'captured' || player.captured === true
        };
      })
    };
    if (resultPanel.isVisible()) {
      resultPanel.updateViewModel(resultViewModel);
    } else {
      resultPanel.show(resultViewModel);
    }
    renderResultPanel();
  }

  function renderResultPanel(): void {
    const state = resultPanel.getDisplayState();
    resultRoot.active = resultPanel.isVisible();
    resultTitle.string = state.titleText;
    resultCaptured.string = state.capturedText;
    resultScores.string = state.scoreLines.join('\n');
    resultRanking.string = state.rankingLines.join('\n');
    resultNext.string = state.matchEndText || state.nextSeekerText;
    resultStatus.string = state.restartStatusText;
    restartButton.active = state.restartButtonVisible;
    roomButton.active = state.restartButtonVisible;
  }

  const inputTimer = setInterval(() => {
    if (inputState.moveX !== 0 || inputState.moveY !== 0) {
      sendInput();
    }
  }, 100);

  router.start();
  addDestroyCleanup(canvas, () => {
    clearInterval(inputTimer);
    touchInputCleanup?.();
    router.stop();
  });
}

function mountSoloGame(canvas: Node): void {
  const root = createRoot(canvas);
  const hud = canvas.addComponent(GameHUD);
  const resultPanel = canvas.addComponent(ResultPanel);
  const mapManager = canvas.addComponent(MapManager);
  const mapRoot = createNode('RuntimeSoloMapRoot', MAP_VIEW_WIDTH, MAP_VIEW_HEIGHT);
  const mapWorldRoot = createNode('RuntimeSoloMapWorldRoot', MAP_WORLD_WIDTH * MAP_WORLD_SCALE, MAP_WORLD_HEIGHT * MAP_WORLD_SCALE);
  const mapForegroundRoot = createNode('RuntimeSoloMapForegroundRoot', MAP_WORLD_WIDTH * MAP_WORLD_SCALE, MAP_WORLD_HEIGHT * MAP_WORLD_SCALE);
  const propNodes = new Map<string, Node>();
  const playerNodes = new Map<string, RuntimeActorNode>();
  const playerVisualEffects = new Map<string, PlayerVisualEffect>();
  let loadedMapState: LoadedMapState | null = null;
  let mapForegroundAttached = false;
  const inputState = {
    moveX: 0,
    moveY: 0,
    engine: null as LocalGameEngine | null,
    computerSeeker: new SoloComputerSeekerController({ humanPlayerId: SOLO_PLAYER_ID }),
    latestSnapshot: null as LocalGameSnapshot | null
  };
  let lastTickMs = Date.now();

  addPanel(root, 960, 640, new Color(15, 23, 42, 255));
  addLabel(root, 'Solo Match', 0, 272, 28, new Color(248, 250, 252, 255), 820, 38);
  const stateLabel = addLabel(root, 'Loading solo match...', 0, 236, 18, new Color(226, 232, 240, 255), 840, 32);
  mapRoot.setPosition(new Vec3(0, 30, 0));
  root.addChild(mapRoot);
  inheritLayer(mapRoot, root);
  addViewportPanel(mapRoot, MAP_VIEW_WIDTH, MAP_VIEW_HEIGHT, new Color(30, 41, 59, 255));
  mapRoot.addChild(mapWorldRoot);
  inheritLayer(mapWorldRoot, mapRoot);
  addKitchenFloor(mapWorldRoot);
  const blindLabel = addLabel(root, '', 0, 30, 26, new Color(226, 232, 240, 255), 760, 58);
  const hudLabel = addLabel(root, '', 0, -178, 16, new Color(203, 213, 225, 255), 840, 56);
  const playersLabel = addLabel(root, '', 0, -242, 15, new Color(203, 213, 225, 255), 840, 72);
  const eventLabel = addLabel(root, '', 0, -292, 15, new Color(147, 197, 253, 255), 840, 28);
  const touchLabel = addLabel(root, '', 0, -148, 14, new Color(148, 163, 184, 255), 840, 24);
  const resultRoot = createNode('RuntimeSoloResultRoot', 760, 420);
  resultRoot.setPosition(new Vec3(0, -8, 0));
  root.addChild(resultRoot);
  inheritLayer(resultRoot, root);
  addPanel(resultRoot, 760, 420, new Color(15, 23, 42, 245));
  const resultTitle = addLabel(resultRoot, '', 0, 150, 28, new Color(248, 250, 252, 255), 700, 38);
  const resultCaptured = addLabel(resultRoot, '', 0, 104, 20, new Color(226, 232, 240, 255), 700, 32);
  const resultScores = addLabel(resultRoot, '', -170, 8, 17, new Color(203, 213, 225, 255), 320, 150);
  const resultRanking = addLabel(resultRoot, '', 190, 8, 17, new Color(203, 213, 225, 255), 320, 150);
  const resultNext = addLabel(resultRoot, '', 0, -106, 18, new Color(147, 197, 253, 255), 700, 30);
  const resultStatus = addLabel(resultRoot, '', 0, -150, 16, new Color(248, 113, 113, 255), 700, 28);
  const restartButton = addButton(resultRoot, 'Restart Match', -88, -190, 170, 42, () => {
    startSoloMatch();
    resultStatus.string = '';
  });
  const lobbyButton = addButton(resultRoot, 'Lobby', 110, -190, 130, 42, () => {
    sessionState.startMultiplayerMode();
    new SceneLoader().load(SceneName.Lobby);
  });
  resultRoot.active = false;

  addButton(root, 'Up', -372, -230, 70, 40, () => setMove(0, -1));
  addButton(root, 'UL', -446, -230, 54, 40, () => setMove(-1, -1));
  addButton(root, 'UR', -298, -230, 54, 40, () => setMove(1, -1));
  addButton(root, 'Left', -446, -276, 70, 40, () => setMove(-1, 0));
  addButton(root, 'Stop', -372, -276, 70, 40, () => setMove(0, 0));
  addButton(root, 'Right', -298, -276, 70, 40, () => setMove(1, 0));
  addButton(root, 'Down', -372, -322, 70, 40, () => setMove(0, 1));
  addButton(root, 'DL', -446, -322, 54, 40, () => setMove(-1, 1));
  addButton(root, 'DR', -298, -322, 54, 40, () => setMove(1, 1));
  const actionLabel = addLabel(root, 'Action', 372, -280, 16, new Color(226, 232, 240, 255), 170, 28);
  addButton(root, 'Action', 372, -320, 130, 46, () => stopThenUseAction());
  const touchInputCleanup = installWeChatGameTouchInput(setMove, stopThenUseAction);
  touchLabel.string = touchInputCleanup
    ? 'Touch controls active: left move, right action'
    : 'Button controls active';

  function startSoloMatch(): void {
    resources.load(ResourcePath.GameConfig, JsonAsset, (gameError, gameAsset) => {
      if (gameError || !gameAsset) {
        stateLabel.string = 'Failed to load solo game config.';
        return;
      }

      resources.load(ResourcePath.KitchenMap, JsonAsset, (mapError, mapAsset) => {
        if (mapError || !mapAsset) {
          stateLabel.string = 'Failed to load solo map.';
          return;
        }

        const playerName = sessionState.getPlayerName() || 'Solo Player';
        sessionState.startSoloMode(playerName, SOLO_PLAYER_ID);
        const computerCount = sessionState.getSoloComputerCount();
        mapManager.loadMap(mapAsset.json as LocalMapConfigInput);
        loadedMapState = mapManager.getLoadedMapState();
        inputState.engine = new LocalGameEngine(
          createLocalGameSetupFromMap(
            loadedMapState,
            gameAsset.json as GameConfig,
            createSoloPlayers(playerName, computerCount)
          )
        );
        inputState.computerSeeker.reset();
        inputState.moveX = 0;
        inputState.moveY = 0;
        resultPanel.hide();
        resultRoot.active = false;
        propNodes.clear();
        playerNodes.clear();
        playerVisualEffects.clear();
        mapWorldRoot.removeAllChildren();
        mapForegroundRoot.removeAllChildren();
        mapForegroundAttached = false;
        renderSoloMapScenery(mapWorldRoot, loadedMapState);
        renderKitchenForeground(mapForegroundRoot, loadedMapState);
        lastTickMs = Date.now();
        renderSnapshot(inputState.engine.getSnapshot());
      });
    });
  }

  function setMove(moveX: number, moveY: number): void {
    inputState.moveX = moveX;
    inputState.moveY = moveY;
    inputState.engine?.setMovementInput({
      playerId: SOLO_PLAYER_ID,
      direction: { x: moveX, y: moveY }
    });
  }

  function useAction(): void {
    const engine = inputState.engine;
    const snapshot = inputState.latestSnapshot;
    if (!engine || !snapshot) {
      return;
    }

    const localPlayer = getSoloLocalPlayer(snapshot);
    if (!localPlayer) {
      return;
    }

    if (localPlayer.role === 'seeker') {
      const result = engine.attack(SOLO_PLAYER_ID);
      if (result.accepted) {
        const now = Date.now();
        const seekerEffect = getOrCreatePlayerVisualEffect(playerVisualEffects, SOLO_PLAYER_ID);
        seekerEffect.attackUntil = now + 480;
        seekerEffect.attackFacing = normalizeFacingForVisuals(localPlayer.facing);
        for (const capturedPlayerId of result.capturedPlayerIds) {
          const capturedEffect = getOrCreatePlayerVisualEffect(playerVisualEffects, capturedPlayerId);
          capturedEffect.revealUntil = now + 700;
          capturedEffect.dizzyUntil = now + 2600;
        }
      }
      eventLabel.string = result.accepted
        ? `Attack: ${result.destroyedPropIds.length} props, ${result.capturedPlayerIds.length} hiders`
        : `Attack ignored: ${result.reason ?? 'not available'}`;
    } else {
      const switched = engine.switchDisguise(SOLO_PLAYER_ID);
      eventLabel.string = switched ? `Switched to ${getSoloLocalPlayer(engine.getSnapshot())?.currentPropId ?? ''}` : '';
    }

    renderSnapshot(engine.getSnapshot());
  }

  function stopThenUseAction(): void {
    setMove(0, 0);
    useAction();
  }

  function renderSnapshot(snapshot: LocalGameSnapshot): void {
    inputState.latestSnapshot = snapshot;
    const view = createSoloMatchPresentation(snapshot, SOLO_PLAYER_ID);
    const localPlayer = view.localPlayer;
    hud.updateViewModel({
      phase: view.phase,
      countdownMs: view.timeLeftMs,
      role: localPlayer?.role ?? 'spectator',
      attackCountRemaining: view.attackCountRemaining,
      remainingAttacks: view.attackCountRemaining,
      currentPropId: localPlayer?.currentPropId ?? null,
      isCaptured: localPlayer?.captured ?? false,
      currentScore: localPlayer?.score ?? null,
      capturedCount: view.capturedHiderCount,
      totalHiders: view.hiderCount,
      scores: view.scores,
      v2Objective: { enabled: false, label: '', progressText: '', completed: false, rewardText: '', hintStatus: 'none' },
      v2AmbientEvent: { enabled: false, status: 'none', title: '', timeLeftMs: null, publicAreaLabel: '' }
    });

    const display = hud.getDisplayState();
    stateLabel.string = `${display.phaseText} | ${display.countdownText} | round ${view.roundIndex + 1}`;
    hudLabel.string = `You: ${display.roleText} | Captured ${display.capturedText} | Attacks ${view.attackCountRemaining} | Move ${inputState.moveX},${inputState.moveY}`;
    playersLabel.string = view.players
      .map((player) => `${player.displayName}: ${player.role}, ${player.state}, score ${player.score}`)
      .join('\n');
    actionLabel.string = localPlayer?.role === 'seeker' ? 'Cone Attack' : 'Switch Prop';
    mapRoot.active = !view.isBlindSeeker;
    blindLabel.string = view.isBlindSeeker ? 'Hiders are arranging the scene' : '';
    renderMatchProps(mapWorldRoot, propNodes, view.props);
    renderMatchPlayers(mapWorldRoot, playerNodes, playerVisualEffects, view);
    mapForegroundAttached = attachKitchenForegroundLayer(mapWorldRoot, mapForegroundRoot, loadedMapState, mapForegroundAttached);
    updateMapCamera(mapWorldRoot, getMatchPresentationCameraFocus(view));

    if (snapshot.phase === 'result' || snapshot.phase === 'match_end') {
      showSoloResult(snapshot);
    } else {
      resultRoot.active = false;
      resultPanel.hide();
    }
  }

  function showSoloResult(snapshot: LocalGameSnapshot): void {
    const result = snapshot.lastRoundResult;
    const hiders = snapshot.players.filter((player) => player.role === 'hider');
    const capturedHiders = hiders.filter((player) => player.captured);
    const nextSeekerId = snapshot.matchEnded ? null : snapshot.players[snapshot.seekerIndex + 1]?.playerId ?? null;
    const resultViewModel = {
      roundIndex: snapshot.roundIndex + 1,
      seekerId: result?.seekerId ?? snapshot.players[snapshot.seekerIndex]?.playerId ?? '',
      capturedCount: capturedHiders.length,
      totalHiders: hiders.length,
      nextSeekerId,
      matchEnded: snapshot.matchEnded,
      scoreDeltas: snapshot.players.map((player) => {
        const delta = result?.scoreDeltas
          .filter((scoreDelta) => scoreDelta.playerId === player.playerId)
          .reduce((total, scoreDelta) => total + scoreDelta.delta, 0) ?? 0;
        return {
          playerId: player.playerId,
          displayName: player.displayName,
          role: player.role,
          delta,
          totalScore: player.score,
          captured: player.captured
        };
      })
    };
    if (resultPanel.isVisible()) {
      resultPanel.updateViewModel(resultViewModel);
    } else {
      resultPanel.show(resultViewModel);
    }
    renderSoloResultPanel();
  }

  function renderSoloResultPanel(): void {
    const state = resultPanel.getDisplayState();
    resultRoot.active = resultPanel.isVisible();
    resultTitle.string = state.titleText;
    resultCaptured.string = state.capturedText;
    resultScores.string = state.scoreLines.join('\n');
    resultRanking.string = state.rankingLines.join('\n');
    resultNext.string = state.matchEndText || state.nextSeekerText;
    resultStatus.string = '';
    restartButton.active = state.restartButtonVisible;
    lobbyButton.active = state.restartButtonVisible;
  }

  const tickTimer = setInterval(() => {
    if (!inputState.engine) {
      return;
    }

    const now = Date.now();
    const deltaMs = now - lastTickMs;
    lastTickMs = now;
    let snapshot = inputState.engine.tick(deltaMs);
    const computerEvent = inputState.computerSeeker.update(inputState.engine, snapshot, deltaMs);
    if (computerEvent) {
      eventLabel.string = computerEvent;
      snapshot = inputState.engine.getSnapshot();
    }
    renderSnapshot(snapshot);
  }, 100);

  startSoloMatch();
  addDestroyCleanup(canvas, () => {
    clearInterval(tickTimer);
    touchInputCleanup?.();
  });
}

function renderMatchProps(
  mapWorldRoot: Node,
  propNodes: Map<string, Node>,
  props: MatchPresentationProp[]
): void {
  const activePropIds = new Set<string>();
  for (const prop of props) {
    activePropIds.add(prop.instanceId);
    let node = propNodes.get(prop.instanceId);
    if (!node) {
      const size = getPropTokenSize(prop.propId, prop.radius);
      node = createMapToken(prop.propId, getPropColor(prop.propId), size, size);
      mapWorldRoot.addChild(node);
      inheritLayer(node, mapWorldRoot);
      propNodes.set(prop.instanceId, node);
    }

    node.active = !prop.destroyed;
    node.setPosition(toMapPosition(prop.position.x, prop.position.y));
  }

  for (const [instanceId, node] of propNodes) {
    if (!activePropIds.has(instanceId)) {
      node.active = false;
    }
  }
}

function renderMatchPlayers(
  mapWorldRoot: Node,
  playerNodes: Map<string, RuntimeActorNode>,
  playerVisualEffects: Map<string, PlayerVisualEffect>,
  view: MatchPresentationView
): void {
  const activePlayerIds = new Set<string>();
  for (const player of view.players) {
    activePlayerIds.add(player.playerId);
    let actor = playerNodes.get(player.playerId);
    if (!actor) {
      actor = createActorToken(player.playerId, player.displayName);
      mapWorldRoot.addChild(actor.node);
      inheritLayer(actor.node, mapWorldRoot);
      playerNodes.set(player.playerId, actor);
    }

    const now = Date.now();
    const visualEffect = getOrCreatePlayerVisualEffect(playerVisualEffects, player.playerId);
    if (player.captured) {
      ensureCaptureVisualEffect(visualEffect, now);
    } else {
      clearCaptureVisualEffect(visualEffect);
    }

    const visualFacing = getVisualEffectFacing(visualEffect, player.facing);
    updatePlayerVisualMovement(visualEffect, player.position.x, player.position.y, now);
    const spritePath = player.disguisedAsProp
      ? getPropSpritePath(player.currentPropId)
      : getCatSpritePath(getCatSkinId(player.playerId), getMatchCatFrame(view.phase, player, visualEffect, visualFacing));
    const tokenWidth = player.disguisedAsProp ? getPropTokenSize(player.currentPropId) : CAT_TOKEN_WIDTH;
    const tokenHeight = player.disguisedAsProp ? getPropTokenSize(player.currentPropId) : CAT_TOKEN_HEIGHT;

    setSpriteTokenSize(actor, tokenWidth, tokenHeight);
    actor.node.active = !player.hidden;
    actor.node.setPosition(toMapPosition(player.position.x, player.position.y));
    actor.label.string = player.disguisedAsProp ? '' : player.displayName;
    setSpriteTokenImage(
      actor,
      spritePath,
      getPlayerColor(player.role, player.captured),
      player.disguisedAsProp ? '' : shortTokenText(player.displayName)
    );
    setSpriteTokenFacing(actor, visualFacing, !player.disguisedAsProp);
    drawActorFallback(actor, player.role, player.captured, player.disguisedAsProp);
  }

  for (const [playerId, actor] of playerNodes) {
    if (!activePlayerIds.has(playerId)) {
      actor.node.active = false;
    }
  }
}

function installWeChatGameTouchInput(
  setMove: (moveX: number, moveY: number) => void,
  sendAction: () => void
): (() => void) | null {
  const wx = getWeChatRuntime();
  if (!wx) {
    return null;
  }

  const systemInfo = wx.getSystemInfoSync?.();
  const layout = createLandscapeControlLayout({
    screenWidth: systemInfo?.windowWidth ?? 960,
    screenHeight: systemInfo?.windowHeight ?? 640,
    safeArea: systemInfo?.safeArea ?? null
  });
  const adapter = new TouchInputAdapter({
    layout,
    sink: {
      setMove: (x, y) => setMove(roundInputAxis(x), -roundInputAxis(y)),
      clearMove: () => setMove(0, 0),
      pressAction: sendAction
    }
  });
  const handleStart = (event: WeChatTouchEvent) => adapter.handleTouchStarts(toTouchPoints(event.changedTouches));
  const handleMove = (event: WeChatTouchEvent) => adapter.handleTouchMoves(toTouchPoints(event.changedTouches));
  const handleEnd = (event: WeChatTouchEvent) => adapter.handleTouchEnds(toTouchIds(event.changedTouches));
  const handleCancel = (event: WeChatTouchEvent) => adapter.handleTouchEnds(toTouchIds(event.changedTouches));

  wx.onTouchStart?.(handleStart);
  wx.onTouchMove?.(handleMove);
  wx.onTouchEnd?.(handleEnd);
  wx.onTouchCancel?.(handleCancel);

  return () => {
    adapter.cancelAll();
    wx.offTouchStart?.(handleStart);
    wx.offTouchMove?.(handleMove);
    wx.offTouchEnd?.(handleEnd);
    wx.offTouchCancel?.(handleCancel);
  };
}

function renderMapSceneryFromResource(parent: Node, onMapLoaded?: (mapState: LoadedMapState) => void): void {
  addKitchenFloor(parent);
  resources.load(ResourcePath.KitchenMap, JsonAsset, (error, mapAsset) => {
    if (error || !mapAsset) {
      return;
    }
    parent.removeAllChildren();
    const mapManager = new MapManager();
    mapManager.loadMap(mapAsset.json as LocalMapConfigInput);
    const mapState = mapManager.getLoadedMapState();
    renderSoloMapScenery(parent, mapState);
    onMapLoaded?.(mapState);
  });
}

function renderSoloMapScenery(parent: Node, mapState: LoadedMapState): void {
  addKitchenFloor(parent);
  for (const obstacle of mapState.obstacles) {
    if (addKitchenFixtureWorld(parent, obstacle)) {
      continue;
    }
    addWorldRect(parent, obstacle, new Color(71, 85, 105, 255));
  }
}

function renderKitchenForeground(parent: Node, mapState: LoadedMapState): void {
  parent.removeAllChildren();
  for (const obstacle of mapState.obstacles) {
    addKitchenStandingFixtureForegroundWorld(parent, obstacle);
  }
}

function attachKitchenForegroundLayer(
  mapWorldRoot: Node,
  foregroundRoot: Node,
  mapState: LoadedMapState | null,
  attached: boolean
): boolean {
  if (!mapState || attached) {
    return attached;
  }

  mapWorldRoot.addChild(foregroundRoot);
  inheritLayer(foregroundRoot, mapWorldRoot);
  return true;
}

function addKitchenFloor(parent: Node): void {
  const floorSize = toMapSize(MAP_WORLD_WIDTH, MAP_WORLD_HEIGHT);
  const floor = createNode('KitchenFloorPattern', floorSize.width, floorSize.height);
  parent.addChild(floor);
  inheritLayer(floor, parent);
  const graphics = floor.addComponent(Graphics);
  graphics.fillColor = new Color(42, 51, 68, 255);
  graphics.rect(-floorSize.width / 2, -floorSize.height / 2, floorSize.width, floorSize.height);
  graphics.fill();
}

function addWorldRect(parent: Node, volume: LoadedMapVolumeState, color: Color): void {
  const size = toMapSize(volume.size.width, volume.size.height);
  const node = createNode(`MapFixture_${volume.id}`, size.width, size.height);
  node.setPosition(toMapPosition(volume.position.x + volume.size.width / 2, volume.position.y + volume.size.height / 2));
  parent.addChild(node);
  inheritLayer(node, parent);
  addPanel(node, size.width, size.height, color);
}

function addKitchenFixtureWorld(parent: Node, volume: LoadedMapVolumeState): boolean {
  const x = volume.position.x;
  const y = volume.position.y;
  const width = volume.size.width;
  const height = volume.size.height;
  if (volume.id === 'obstacle_center_table') {
    addKitchenTableWorld(parent, x, y, width, height);
    return true;
  }
  if (volume.id === 'obstacle_fridge') {
    const visual = getKitchenStandingFixtureVisualRect(volume);
    addKitchenFridgeWorld(parent, visual.x, visual.y, visual.width, visual.height);
    return true;
  }
  if (volume.id === 'obstacle_sink_counter') {
    addKitchenSinkCounterWorld(parent, x, y, width, height);
    return true;
  }
  if (volume.id === 'obstacle_stove') {
    addKitchenStoveWorld(parent, x, y, width, height);
    return true;
  }
  if (volume.id === 'obstacle_pantry') {
    const visual = getKitchenStandingFixtureVisualRect(volume);
    addKitchenPantryWorld(parent, visual.x, visual.y, visual.width, visual.height);
    return true;
  }
  if (volume.id === 'obstacle_crate_shelf') {
    const visual = getKitchenStandingFixtureVisualRect(volume);
    addKitchenCrateShelfWorld(parent, visual.x, visual.y, visual.width, visual.height);
    return true;
  }
  return false;
}

function getKitchenStandingFixtureVisualRect(volume: LoadedMapVolumeState): WorldRect {
  const scale = getKitchenStandingFixtureVisualScale(volume.id);
  const width = volume.size.width * scale.width;
  const height = volume.size.height * scale.height;
  const anchorY = volume.position.y + volume.size.height * 0.88;
  return {
    x: volume.position.x + volume.size.width / 2 - width / 2,
    y: anchorY - height * 0.88,
    width,
    height
  };
}

function getKitchenStandingFixtureVisualScale(volumeId: string): { width: number; height: number } {
  if (volumeId === 'obstacle_crate_shelf') {
    return { width: 2.35, height: 2.05 };
  }
  if (volumeId === 'obstacle_pantry') {
    return { width: 2.0, height: 1.6 };
  }
  return { width: 1.8, height: 1.6 };
}

function addKitchenFridgeWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenFridgePerspectiveWorld(parent, 'KitchenFridge', x, y, width, height, true);
}

function addKitchenFridgePerspectiveWorld(
  parent: Node,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
  includeShadow: boolean
): void {
  if (includeShadow) {
    addWorldPanel(parent, `${prefix}Shadow`, x + width / 2, y + height * 0.88, width * 1.04, height * 0.14, new Color(15, 23, 42, 64));
  }
  addWorldQuad(parent, `${prefix}PerspectiveTop`, [
    { x: x + width * 0.18, y: y + height * 0.14 },
    { x: x + width * 0.72, y: y + height * 0.20 },
    { x: x + width * 0.88, y: y + height * 0.30 },
    { x: x + width * 0.34, y: y + height * 0.24 }
  ], new Color(240, 249, 255, 255));
  addWorldQuad(parent, `${prefix}PerspectiveSide`, [
    { x: x + width * 0.72, y: y + height * 0.20 },
    { x: x + width * 0.88, y: y + height * 0.30 },
    { x: x + width * 0.88, y: y + height * 0.83 },
    { x: x + width * 0.72, y: y + height * 0.76 }
  ], new Color(147, 197, 253, 255));
  addWorldQuad(parent, `${prefix}PerspectiveFront`, [
    { x: x + width * 0.18, y: y + height * 0.14 },
    { x: x + width * 0.72, y: y + height * 0.20 },
    { x: x + width * 0.72, y: y + height * 0.76 },
    { x: x + width * 0.18, y: y + height * 0.84 }
  ], new Color(219, 234, 254, 255));
  addWorldQuad(parent, `${prefix}PerspectiveFreezer`, [
    { x: x + width * 0.22, y: y + height * 0.19 },
    { x: x + width * 0.67, y: y + height * 0.24 },
    { x: x + width * 0.67, y: y + height * 0.40 },
    { x: x + width * 0.22, y: y + height * 0.45 }
  ], new Color(191, 219, 254, 255));
  addWorldPanel(parent, `${prefix}PerspectiveHandleTop`, x + width * 0.645, y + height * 0.35, width * 0.05, height * 0.10, new Color(100, 116, 139, 255));
  addWorldPanel(parent, `${prefix}PerspectiveHandleBottom`, x + width * 0.645, y + height * 0.63, width * 0.05, height * 0.17, new Color(100, 116, 139, 255));
  addWorldQuad(parent, `${prefix}PerspectiveShine`, [
    { x: x + width * 0.28, y: y + height * 0.20 },
    { x: x + width * 0.40, y: y + height * 0.21 },
    { x: x + width * 0.40, y: y + height * 0.72 },
    { x: x + width * 0.28, y: y + height * 0.76 }
  ], new Color(248, 250, 252, 104));
}

function addKitchenCounterWorld(parent: Node, prefix: string, x: number, y: number, width: number, height: number, colors: {
  side: Color;
  front: Color;
  door: Color;
  top: Color;
  highlight: Color;
}): void {
  addWorldPanel(parent, `${prefix}Shadow`, x + width / 2, y + height * 0.88, width * 1.04, height * 0.20, new Color(15, 23, 42, 58));
  addWorldPanel(parent, `${prefix}Side`, x + width / 2, y + height * 0.63, width * 0.84, height * 0.58, colors.side);
  addWorldPanel(parent, `${prefix}Front`, x + width / 2, y + height * 0.69, width * 0.80, height * 0.42, colors.front);
  addWorldPanel(parent, `${prefix}DoorLeft`, x + width * 0.29, y + height * 0.68, width * 0.26, height * 0.26, colors.door);
  addWorldPanel(parent, `${prefix}DoorRight`, x + width * 0.71, y + height * 0.68, width * 0.26, height * 0.26, colors.door);
  addWorldPanel(parent, `${prefix}Top`, x + width / 2, y + height * 0.37, width * 0.96, height * 0.24, colors.top);
  addWorldPanel(parent, `${prefix}Highlight`, x + width * 0.45, y + height * 0.32, width * 0.70, height * 0.06, colors.highlight);
}

function addKitchenSinkCounterWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenCounterWorld(parent, 'KitchenSinkCounter', x, y, width, height, {
    side: new Color(133, 77, 14, 255),
    front: new Color(161, 98, 7, 255),
    door: new Color(180, 83, 9, 255),
    top: new Color(231, 229, 228, 255),
    highlight: new Color(248, 250, 252, 255)
  });
  addSpriteAtWorldRect(parent, 'art/props/generated/kitchen_v2/map_sink', x + width * 0.26, y + height * 0.08, width * 0.48, height * 0.72, new Color(203, 213, 225, 255));
  addWorldPanel(parent, 'KitchenSinkBasin', x + width * 0.51, y + height * 0.405, width * 0.22, height * 0.15, new Color(148, 163, 184, 255));
  addWorldPanel(parent, 'KitchenSinkFaucet', x + width * 0.65, y + height * 0.38, width * 0.025, height * 0.20, new Color(14, 165, 233, 255));
}

function addKitchenStoveWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenCounterWorld(parent, 'KitchenStove', x, y, width, height, {
    side: new Color(63, 63, 70, 255),
    front: new Color(82, 82, 91, 255),
    door: new Color(113, 113, 122, 255),
    top: new Color(31, 41, 55, 255),
    highlight: new Color(148, 163, 184, 255)
  });
  addSpriteAtWorldRect(parent, 'art/props/generated/kitchen_v2/map_stove', x + width * 0.24, y + height * 0.08, width * 0.52, height * 0.72, new Color(71, 85, 105, 255));
  addWorldCircle(parent, 'KitchenStoveBurnerLeft', x + width * 0.40, y + height * 0.38, Math.min(width, height) * 0.045, new Color(203, 213, 225, 255));
  addWorldCircle(parent, 'KitchenStoveBurnerRight', x + width * 0.55, y + height * 0.38, Math.min(width, height) * 0.045, new Color(203, 213, 225, 255));
}

function addKitchenPantryWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenPantryPerspectiveWorld(parent, 'KitchenPantry', x, y, width, height, true);
}

function addKitchenPantryPerspectiveWorld(
  parent: Node,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
  includeShadow: boolean
): void {
  if (includeShadow) {
    addWorldPanel(parent, `${prefix}Shadow`, x + width / 2, y + height * 0.89, width * 0.98, height * 0.14, new Color(15, 23, 42, 58));
  }
  addWorldQuad(parent, `${prefix}PerspectiveTop`, [
    { x: x + width * 0.14, y: y + height * 0.12 },
    { x: x + width * 0.72, y: y + height * 0.18 },
    { x: x + width * 0.90, y: y + height * 0.29 },
    { x: x + width * 0.32, y: y + height * 0.23 }
  ], new Color(217, 119, 6, 255));
  addWorldQuad(parent, `${prefix}PerspectiveSide`, [
    { x: x + width * 0.72, y: y + height * 0.18 },
    { x: x + width * 0.90, y: y + height * 0.29 },
    { x: x + width * 0.90, y: y + height * 0.84 },
    { x: x + width * 0.72, y: y + height * 0.76 }
  ], new Color(113, 63, 18, 255));
  addWorldQuad(parent, `${prefix}PerspectiveFront`, [
    { x: x + width * 0.14, y: y + height * 0.12 },
    { x: x + width * 0.72, y: y + height * 0.18 },
    { x: x + width * 0.72, y: y + height * 0.76 },
    { x: x + width * 0.14, y: y + height * 0.84 }
  ], new Color(161, 98, 7, 255));
  addWorldQuad(parent, `${prefix}PerspectiveDoorLeft`, [
    { x: x + width * 0.22, y: y + height * 0.20 },
    { x: x + width * 0.43, y: y + height * 0.22 },
    { x: x + width * 0.43, y: y + height * 0.72 },
    { x: x + width * 0.22, y: y + height * 0.76 }
  ], new Color(202, 138, 4, 255));
  addWorldQuad(parent, `${prefix}PerspectiveDoorRight`, [
    { x: x + width * 0.50, y: y + height * 0.23 },
    { x: x + width * 0.68, y: y + height * 0.25 },
    { x: x + width * 0.68, y: y + height * 0.70 },
    { x: x + width * 0.50, y: y + height * 0.73 }
  ], new Color(202, 138, 4, 255));
  addWorldPanel(parent, `${prefix}PerspectiveHandle`, x + width * 0.45, y + height * 0.47, width * 0.06, height * 0.06, new Color(251, 191, 36, 255));
}

function addKitchenCrateShelfWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenCrateShelfPerspectiveWorld(parent, 'KitchenCrateShelf', x, y, width, height, true);
}

function addKitchenCrateShelfPerspectiveWorld(
  parent: Node,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
  includeShadow: boolean
): void {
  if (includeShadow) {
    addWorldPanel(parent, `${prefix}Shadow`, x + width / 2, y + height * 0.88, width * 1.08, height * 0.18, new Color(15, 23, 42, 58));
  }
  addWorldQuad(parent, `${prefix}PerspectiveTop`, [
    { x: x + width * 0.12, y: y + height * 0.16 },
    { x: x + width * 0.72, y: y + height * 0.22 },
    { x: x + width * 0.90, y: y + height * 0.32 },
    { x: x + width * 0.30, y: y + height * 0.25 }
  ], new Color(245, 158, 11, 255));
  addWorldQuad(parent, `${prefix}PerspectiveSide`, [
    { x: x + width * 0.72, y: y + height * 0.22 },
    { x: x + width * 0.90, y: y + height * 0.32 },
    { x: x + width * 0.90, y: y + height * 0.78 },
    { x: x + width * 0.72, y: y + height * 0.70 }
  ], new Color(120, 53, 15, 255));
  addWorldQuad(parent, `${prefix}PerspectiveFront`, [
    { x: x + width * 0.12, y: y + height * 0.16 },
    { x: x + width * 0.72, y: y + height * 0.22 },
    { x: x + width * 0.72, y: y + height * 0.70 },
    { x: x + width * 0.12, y: y + height * 0.82 }
  ], new Color(146, 64, 14, 255));
  addWorldPanel(parent, `${prefix}PerspectivePlankTop`, x + width * 0.42, y + height * 0.38, width * 0.54, height * 0.07, new Color(245, 158, 11, 255));
  addWorldPanel(parent, `${prefix}PerspectivePlankBottom`, x + width * 0.42, y + height * 0.575, width * 0.54, height * 0.07, new Color(245, 158, 11, 255));
  addWorldQuad(parent, `${prefix}PerspectiveBoxTop`, [
    { x: x + width * 0.20, y: y + height * 0.22 },
    { x: x + width * 0.40, y: y + height * 0.24 },
    { x: x + width * 0.40, y: y + height * 0.34 },
    { x: x + width * 0.20, y: y + height * 0.36 }
  ], new Color(180, 83, 9, 255));
  addWorldQuad(parent, `${prefix}PerspectiveBoxBottom`, [
    { x: x + width * 0.48, y: y + height * 0.44 },
    { x: x + width * 0.66, y: y + height * 0.45 },
    { x: x + width * 0.66, y: y + height * 0.54 },
    { x: x + width * 0.48, y: y + height * 0.56 }
  ], new Color(180, 83, 9, 255));
}

function addKitchenStandingFixtureForegroundWorld(parent: Node, volume: LoadedMapVolumeState): void {
  const visual = getKitchenStandingFixtureVisualRect(volume);
  const x = visual.x;
  const y = visual.y;
  const width = visual.width;
  const height = visual.height;
  if (volume.id === 'obstacle_fridge') {
    addKitchenFridgeForegroundWorld(parent, x, y, width, height);
  } else if (volume.id === 'obstacle_pantry') {
    addKitchenPantryForegroundWorld(parent, x, y, width, height);
  } else if (volume.id === 'obstacle_crate_shelf') {
    addKitchenCrateShelfForegroundWorld(parent, x, y, width, height);
  }
}

function addKitchenFridgeForegroundWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenFridgePerspectiveWorld(parent, 'KitchenFridgeForeground', x, y, width, height, false);
}

function addKitchenPantryForegroundWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenPantryPerspectiveWorld(parent, 'KitchenPantryForeground', x, y, width, height, false);
}

function addKitchenCrateShelfForegroundWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addKitchenCrateShelfPerspectiveWorld(parent, 'KitchenCrateShelfForeground', x, y, width, height, false);
}

function addKitchenTableWorld(parent: Node, x: number, y: number, width: number, height: number): void {
  addWorldPanel(parent, 'KitchenTableShadow', x + width / 2, y + height * 0.86, width * 1.18, height * 0.28, new Color(15, 23, 42, 72));
  addWorldPanel(parent, 'KitchenTableLegLeft', x + width * 0.20, y + height * 0.74, width * 0.10, height * 0.34, new Color(94, 55, 28, 255));
  addWorldPanel(parent, 'KitchenTableLegRight', x + width * 0.80, y + height * 0.74, width * 0.10, height * 0.34, new Color(94, 55, 28, 255));
  addWorldPanel(parent, 'KitchenTableApron', x + width / 2, y + height * 0.62, width * 0.72, height * 0.18, new Color(126, 70, 31, 255));
  addWorldPanel(parent, 'KitchenTableFrontLip', x + width / 2, y + height * 0.68, width * 0.82, height * 0.22, new Color(104, 59, 29, 255));
  addWorldPanel(parent, 'KitchenTableTop', x + width / 2, y + height * 0.32, width * 0.96, height * 0.54, new Color(194, 122, 52, 255));
  addWorldPanel(parent, 'KitchenTableTopHighlight', x + width / 2, y + height * 0.22, width * 0.78, height * 0.08, new Color(226, 167, 97, 255));
  addWorldCircle(parent, 'KitchenTablePlate', x + width * 0.35, y + height * 0.34, Math.min(width, height) * 0.095, new Color(248, 250, 252, 255));
  addWorldPanel(parent, 'KitchenTableTray', x + width * 0.69, y + height * 0.34, width * 0.18, height * 0.10, new Color(217, 119, 6, 255));
  addWorldPanel(parent, 'KitchenTableBread', x + width * 0.69, y + height * 0.43, width * 0.12, height * 0.06, new Color(146, 64, 14, 255));
}

function addWorldPanel(
  parent: Node,
  name: string,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  color: Color
): void {
  const size = toMapSize(width, height);
  const node = createNode(name, size.width, size.height);
  node.setPosition(toMapPosition(centerX, centerY));
  parent.addChild(node);
  inheritLayer(node, parent);
  addPanel(node, size.width, size.height, color);
}

function addWorldQuad(parent: Node, name: string, points: WorldQuadPoint[], color: Color): void {
  if (points.length < 3) {
    return;
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const size = toMapSize(Math.max(1, maxX - minX), Math.max(1, maxY - minY));
  const node = createNode(name, size.width, size.height);
  node.setPosition(toMapPosition(centerX, centerY));
  parent.addChild(node);
  inheritLayer(node, parent);

  const graphics = node.addComponent(Graphics);
  graphics.fillColor = color;
  graphics.moveTo((points[0].x - centerX) * MAP_WORLD_SCALE, (centerY - points[0].y) * MAP_WORLD_SCALE);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo((points[index].x - centerX) * MAP_WORLD_SCALE, (centerY - points[index].y) * MAP_WORLD_SCALE);
  }
  graphics.close();
  graphics.fill();
}

function addWorldCircle(parent: Node, name: string, centerX: number, centerY: number, radius: number, color: Color): void {
  const size = toMapSize(radius * 2, radius * 2);
  const node = createNode(name, size.width, size.height);
  node.setPosition(toMapPosition(centerX, centerY));
  parent.addChild(node);
  inheritLayer(node, parent);
  const graphics = node.addComponent(Graphics);
  graphics.fillColor = color;
  graphics.circle(0, 0, Math.max(size.width, size.height) / 2);
  graphics.fill();
}

function addSpriteAtWorldRect(
  parent: Node,
  resourcePath: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fallbackColor: Color
): void {
  const size = toMapSize(width, height);
  const safeName = resourcePath.replace(/[^a-z0-9_]/gi, '_');
  const token = createSpriteToken(`MapSprite_${safeName}`, resourcePath, '', fallbackColor, size.width, size.height);
  token.node.setPosition(toMapPosition(x + width / 2, y + height / 2));
  parent.addChild(token.node);
  inheritLayer(token.node, parent);
}

function createMapToken(text: string, color: Color, width: number, height: number): Node {
  return createSpriteToken(`Token_${text}`, getPropSpritePath(text), shortTokenText(text), color, width, height).node;
}

function createActorToken(playerId: string, displayName: string): RuntimeActorNode {
  const token = createSpriteToken(
    `Actor_${displayName}`,
    getCatSpritePath(getCatSkinId(playerId)),
    shortTokenText(displayName),
    new Color(37, 99, 235, 255),
    46,
    42
  );
  const label = addLabel(token.node, displayName, 0, -24, 10, new Color(248, 250, 252, 255), 92, 18);
  return { ...token, label };
}

function createSpriteToken(
  name: string,
  resourcePath: string,
  fallbackText: string,
  fallbackColor: Color,
  width: number,
  height: number
): RuntimeSpriteToken {
  const node = createNode(name, width, height);
  const fallbackNode = createNode(`${name}_Fallback`, width, height);
  node.addChild(fallbackNode);
  inheritLayer(fallbackNode, node);
  const fallbackGraphics = fallbackNode.addComponent(Graphics);

  const spriteNode = createNode(`${name}_Sprite`, width, height);
  node.addChild(spriteNode);
  inheritLayer(spriteNode, node);
  const sprite = spriteNode.addComponent(Sprite);
  const fallbackLabel = addLabel(fallbackNode, fallbackText, 0, 0, 10, new Color(255, 255, 255, 255), width, height);
  const token = { node, sprite, fallbackNode, fallbackGraphics, fallbackLabel, width, height, resourcePath: '' };
  setSpriteTokenImage(token, resourcePath, fallbackColor, fallbackText);
  return token;
}

function setSpriteTokenImage(token: RuntimeSpriteToken, resourcePath: string, fallbackColor: Color, fallbackText: string): void {
  if (token.resourcePath === resourcePath && token.sprite.spriteFrame) {
    return;
  }

  token.resourcePath = resourcePath;
  token.sprite.spriteFrame = null;
  token.fallbackNode.active = true;
  token.fallbackLabel.string = fallbackText;
  drawRectFallback(token, fallbackColor);

  loadSpriteFrame(resourcePath, (spriteFrame) => {
    if (token.resourcePath !== resourcePath) {
      return;
    }
    token.sprite.spriteFrame = spriteFrame;
    token.fallbackNode.active = false;
  });
}

function setSpriteTokenSize(token: RuntimeSpriteToken, width: number, height: number): void {
  if (Math.abs(token.width - width) < 0.01 && Math.abs(token.height - height) < 0.01) {
    return;
  }

  token.width = width;
  token.height = height;
  token.node.getComponent(UITransform)?.setContentSize(new Size(width, height));
  token.sprite.node.getComponent(UITransform)?.setContentSize(new Size(width, height));
  token.fallbackNode.getComponent(UITransform)?.setContentSize(new Size(width, height));
  token.fallbackLabel.node.getComponent(UITransform)?.setContentSize(new Size(width, height));
  token.fallbackLabel.fontSize = Math.max(8, Math.min(10, width * 0.32));
  drawRectFallback(token, new Color(71, 85, 105, 255));
}

function loadSpriteFrame(resourcePath: string, onLoaded: (spriteFrame: SpriteFrame) => void): void {
  const cached = spriteFrameCache.get(resourcePath);
  if (cached) {
    onLoaded(cached);
    return;
  }
  if (cached === null) {
    const callbacks = spriteFrameCallbacks.get(resourcePath) ?? [];
    callbacks.push(onLoaded);
    spriteFrameCallbacks.set(resourcePath, callbacks);
    return;
  }

  spriteFrameCache.set(resourcePath, null);
  spriteFrameCallbacks.set(resourcePath, [onLoaded]);
  resources.load(`${resourcePath}/spriteFrame`, SpriteFrame, (error, spriteFrame) => {
    if (error || !spriteFrame) {
      spriteFrameCache.delete(resourcePath);
      spriteFrameCallbacks.delete(resourcePath);
      return;
    }
    spriteFrameCache.set(resourcePath, spriteFrame);
    const callbacks = spriteFrameCallbacks.get(resourcePath) ?? [];
    spriteFrameCallbacks.delete(resourcePath);
    callbacks.forEach((callback) => callback(spriteFrame));
  });
}

function setSpriteTokenFacing(token: RuntimeSpriteToken, facing: { x: number; y: number } | undefined, enabled: boolean): void {
  const transform = enabled ? getSpriteFacingTransform(facing) : { scaleX: 1 };
  applyNodeFacing(token.sprite.node, transform.angleDeg, transform.scaleX);
  applyNodeFacing(token.fallbackNode, transform.angleDeg, transform.scaleX);
}

function getSpriteFacingTransform(facing: { x: number; y: number } | undefined): { angleDeg?: number; scaleX: number } {
  const normalized = normalizeFacingForVisuals(facing);
  return { angleDeg: 0, scaleX: shouldMirrorDirectionalCat(normalized) ? -1 : 1 };
}

function normalizeFacingForVisuals(facing: { x: number; y: number } | undefined): { x: number; y: number } {
  const x = Number.isFinite(facing?.x) ? facing?.x ?? 1 : 1;
  const y = Number.isFinite(facing?.y) ? facing?.y ?? 0 : 0;
  const length = Math.hypot(x, y);
  if (length <= 0.01) {
    return { x: 1, y: 0 };
  }
  return { x: x / length, y: y / length };
}

function shouldMirrorDirectionalCat(facing: { x: number; y: number }): boolean {
  const bucket = getDirectionalCatBucket(facing);
  return (bucket === 'side' || bucket === 'diag_front' || bucket === 'diag_back') && facing.x < 0;
}

function applyNodeFacing(node: Node, angleDeg: number | undefined, scaleX: number): void {
  const runtimeNode = node as Node & {
    angle?: number;
    setScale?: (x: number, y: number, z?: number) => void;
  };
  runtimeNode.angle = angleDeg ?? 0;
  runtimeNode.setScale?.(scaleX, 1, 1);
}

function drawActorFallback(actor: RuntimeActorNode, role: string, captured: boolean, disguisedAsProp: boolean): void {
  const graphics = actor.fallbackGraphics;
  graphics.clear();
  graphics.fillColor = getPlayerColor(role, captured);
  if (disguisedAsProp) {
    graphics.rect(-17, -17, 34, 34);
  } else {
    graphics.circle(0, 3, 15);
  }
  graphics.fill();
}

function drawRectFallback(token: RuntimeSpriteToken, color: Color): void {
  token.fallbackGraphics.clear();
  token.fallbackGraphics.fillColor = color;
  token.fallbackGraphics.rect(-token.width / 2, -token.height / 2, token.width, token.height);
  token.fallbackGraphics.fill();
}

function toMapPosition(x: number, y: number): Vec3 {
  return new Vec3(
    (x - MAP_WORLD_WIDTH / 2) * MAP_WORLD_SCALE,
    (MAP_WORLD_HEIGHT / 2 - y) * MAP_WORLD_SCALE,
    0
  );
}

function toMapSize(width: number, height: number): { width: number; height: number } {
  return {
    width: width * MAP_WORLD_SCALE,
    height: height * MAP_WORLD_SCALE
  };
}

function updateMapCamera(worldRoot: Node, focus: { x: number; y: number } | null): void {
  const worldRenderWidth = MAP_WORLD_WIDTH * MAP_WORLD_SCALE;
  const worldRenderHeight = MAP_WORLD_HEIGHT * MAP_WORLD_SCALE;
  const padding = focus ? 0 : PREVIEW_MAP_PADDING;
  const fullMapScale = Math.min(
    1,
    (MAP_VIEW_WIDTH - padding * 2) / worldRenderWidth,
    (MAP_VIEW_HEIGHT - padding * 2) / worldRenderHeight
  );
  setNodeUniformScale(worldRoot, fullMapScale);
  worldRoot.setPosition(new Vec3(0, 0, 0));
}

function setNodeUniformScale(node: Node, scale: number): void {
  const scalableNode = node as Node & {
    setScale?: (x: number, y: number, z?: number) => void;
  };
  scalableNode.setScale?.(scale, scale, 1);
}

function getSoloLocalPlayer(snapshot: LocalGameSnapshot): LocalGameSnapshot['players'][number] | null {
  return snapshot.players.find((player) => player.playerId === SOLO_PLAYER_ID) ?? null;
}

function createSoloPlayers(
  playerName: string,
  computerCount: number
): Array<{ playerId: string; displayName: string; startFacing?: { x: number; y: number } }> {
  return [
    { playerId: SOLO_PLAYER_ID, displayName: playerName, startFacing: { x: 0, y: -1 } },
    ...Array.from({ length: computerCount }, (_, index) => ({
      playerId: `solo_computer_${index + 1}`,
      displayName: `Computer ${index + 1}`
    }))
  ];
}

function getPropColor(propConfigId: string): Color {
  if (propConfigId.includes('plant')) {
    return new Color(22, 101, 52, 255);
  }
  if (propConfigId.includes('bucket') || propConfigId.includes('trash')) {
    return new Color(8, 145, 178, 255);
  }
  if (propConfigId.includes('chair')) {
    return new Color(146, 64, 14, 255);
  }
  return new Color(120, 53, 15, 255);
}

function getPlayerColor(role: string, captured: boolean): Color {
  if (captured) {
    return new Color(100, 116, 139, 255);
  }
  return role === 'seeker' ? new Color(37, 99, 235, 255) : new Color(234, 88, 12, 255);
}

function getPropSpritePath(propConfigId: string): string {
  return `art/props/generated/kitchen_v2/prop_${propConfigId}`;
}

function getPropTokenSize(propConfigId: string, radius = PROP_RENDER_RADIUS_BY_ID[propConfigId] ?? 16): number {
  return Math.max(18, radius * 2 * MAP_WORLD_SCALE * 1.28);
}

function getCatSpritePath(skinId: string, frame = 'idle'): string {
  return `art/characters/cat_animations/${skinId}_${frame}`;
}

function getMatchCatFrame(
  phase: RoundPhase,
  player: MatchPresentationPlayer,
  effect: PlayerVisualEffect,
  visualFacing: { x: number; y: number }
): string {
  const now = Date.now();
  if (now < effect.revealUntil) {
    return 'reveal';
  }
  if (player.captured || now < effect.dizzyUntil) {
    return 'dizzy';
  }
  if (now < effect.attackUntil) {
    return getDirectionalAttackFrame(visualFacing, effect.attackUntil - now > 220 ? 1 : 2);
  }
  if ((phase === RoundPhase.Result || phase === RoundPhase.MatchEnd) && player.role === 'hider' && !player.captured) {
    return getDirectionalTauntFrame(visualFacing, now);
  }
  const movingAsHiderCharacter = player.role === 'hider' && player.state === 'hider_moving_as_character';
  if (now < effect.movingUntil || movingAsHiderCharacter) {
    return getDirectionalCatFrame(visualFacing, true, now);
  }
  return getDirectionalCatFrame(visualFacing, false, now);
}

function getDirectionalCatFrame(facing: { x: number; y: number }, moving: boolean, now: number): string {
  const bucket = getDirectionalCatBucket(normalizeFacingForVisuals(facing));
  if (!moving) {
    return bucket === 'side' ? 'side_crouch' : `${bucket}_crouch`;
  }
  const step = now % 360 < 180 ? 'walk_1' : 'walk_2';
  if (bucket === 'side') {
    return step;
  }
  return `${bucket}_${step}`;
}

function getDirectionalAttackFrame(facing: { x: number; y: number }, frameIndex: 1 | 2): string {
  const bucket = getDirectionalCatBucket(normalizeFacingForVisuals(facing));
  return bucket === 'side' ? `side_attack_${frameIndex}` : `${bucket}_attack_${frameIndex}`;
}

function getDirectionalTauntFrame(facing: { x: number; y: number }, now: number): string {
  return getDirectionalAttackFrame(facing, now % 480 < 240 ? 1 : 2);
}

function getDirectionalCatBucket(facing: { x: number; y: number }): 'side' | 'front' | 'back' | 'diag_front' | 'diag_back' {
  const absX = Math.abs(facing.x);
  const absY = Math.abs(facing.y);
  if (absY < 0.35 || absX > absY * 1.45) {
    return 'side';
  }
  if (absX >= 0.28) {
    return facing.y > 0 ? 'diag_front' : 'diag_back';
  }
  return facing.y > 0 ? 'front' : 'back';
}

function getOrCreatePlayerVisualEffect(effects: Map<string, PlayerVisualEffect>, playerId: string): PlayerVisualEffect {
  let effect = effects.get(playerId);
  if (!effect) {
    effect = {
      attackUntil: 0,
      revealUntil: 0,
      dizzyUntil: 0,
      movingUntil: 0,
      attackFacing: null,
      lastX: null,
      lastY: null
    };
    effects.set(playerId, effect);
  }
  return effect;
}

function ensureCaptureVisualEffect(effect: PlayerVisualEffect, now: number): void {
  if (effect.revealUntil > 0 || effect.dizzyUntil > 0) {
    return;
  }

  effect.revealUntil = now + 700;
  effect.dizzyUntil = now + 2600;
}

function clearCaptureVisualEffect(effect: PlayerVisualEffect): void {
  effect.revealUntil = 0;
  effect.dizzyUntil = 0;
}

function getVisualEffectFacing(effect: PlayerVisualEffect, fallbackFacing: { x: number; y: number }): { x: number; y: number } {
  if (Date.now() < effect.attackUntil && effect.attackFacing) {
    return effect.attackFacing;
  }
  return fallbackFacing;
}

function updatePlayerVisualMovement(
  effect: PlayerVisualEffect,
  x: number,
  y: number,
  now: number
): void {
  const movedSinceLastFrame = effect.lastX !== null && effect.lastY !== null &&
    Math.hypot(x - effect.lastX, y - effect.lastY) > 0.2;
  if (movedSinceLastFrame) {
    effect.movingUntil = now + 180;
  } else {
    effect.movingUntil = 0;
  }
  effect.lastX = x;
  effect.lastY = y;
}

function getCatSkinId(playerId: string): string {
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = (hash * 31 + playerId.charCodeAt(index)) >>> 0;
  }
  return CAT_SKINS[hash % CAT_SKINS.length] ?? CAT_SKINS[0];
}

function shortTokenText(text: string): string {
  return text
    .split('_')
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3);
}

function getWeChatRuntime(): WeChatGameRuntime | null {
  const runtime = globalThis as { wx?: WeChatGameRuntime };
  const wx = runtime.wx;
  if (!wx || typeof wx.onTouchStart !== 'function') {
    return null;
  }

  return wx;
}

function toTouchPoints(touches: readonly WeChatTouch[] | undefined): TouchPoint[] {
  return (touches ?? []).map((touch, index) => ({
    id: touch.identifier ?? index,
    x: touch.clientX,
    y: touch.clientY
  }));
}

function toTouchIds(touches: readonly WeChatTouch[] | undefined): Array<number | string> {
  return (touches ?? []).map((touch, index) => touch.identifier ?? index);
}

function roundInputAxis(value: number): number {
  if (Math.abs(value) < 0.01) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function createRoot(canvas: Node): Node {
  const root = createNode('RuntimeSceneRoot', 960, 640);
  canvas.addChild(root);
  inheritLayer(root, canvas);
  return root;
}

function addDestroyCleanup(node: Node, cleanup: () => void): void {
  const runtimeNode = node as RuntimeCleanupNode;
  if (!runtimeNode.__propHideSeekCleanups) {
    runtimeNode.__propHideSeekCleanups = [];
    const originalDestroy = node.destroy.bind(node);
    node.destroy = () => {
      for (const item of runtimeNode.__propHideSeekCleanups ?? []) {
        item();
      }
      runtimeNode.__propHideSeekCleanups = [];
      return originalDestroy() as unknown as boolean;
    };
  }

  runtimeNode.__propHideSeekCleanups.push(cleanup);
}

function ensureCanvas(scene: Node): Node | null {
  let canvas = scene.getChildByName?.('Canvas') ?? null;
  if (canvas) {
    canvas.getComponent(UITransform)?.setContentSize(new Size(960, 640));
    return canvas;
  }

  if (typeof scene.addChild !== 'function') {
    return null;
  }

  canvas = createNode('Canvas', 960, 640);
  scene.addChild(canvas);
  return canvas;
}

function createNode(name: string, width: number, height: number): Node {
  const node = new Node(name);
  const transform = node.addComponent(UITransform);
  transform.setContentSize(new Size(width, height));
  return node;
}

function addPanel(parent: Node, width: number, height: number, color: Color): void {
  parent.getComponent(UITransform)?.setContentSize(new Size(width, height));
  const graphics = parent.addComponent(Graphics);
  graphics.fillColor = color;
  graphics.rect(-width / 2, -height / 2, width, height);
  graphics.fill();
}

function addViewportPanel(parent: Node, width: number, height: number, color: Color): void {
  addPanel(parent, width, height, color);
  const mask = parent.addComponent(Mask) as Mask & { type?: number };
  const rectMask = (Mask as unknown as { Type?: { RECT?: number } }).Type?.RECT;
  if (typeof rectMask === 'number') {
    mask.type = rectMask;
  }
}

function addLabel(
  parent: Node,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: Color,
  width: number,
  height: number
): Label {
  const node = createNode(`Label_${text || 'empty'}`, width, height);
  node.setPosition(new Vec3(x, y, 0));
  parent.addChild(node);
  inheritLayer(node, parent);

  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.max(fontSize + 8, 24);
  label.color = color;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  return label;
}

function addEditBox(parent: Node, placeholder: string, value: string, x: number, y: number, width: number, height: number): EditBox {
  const node = createNode(`Input_${placeholder}`, width, height);
  node.setPosition(new Vec3(x, y, 0));
  parent.addChild(node);
  inheritLayer(node, parent);
  addPanel(node, width, height, new Color(241, 245, 249, 255));

  const editBox = node.addComponent(EditBox);
  editBox.placeholder = placeholder;
  editBox.string = value;
  return editBox;
}

function addButton(parent: Node, text: string, x: number, y: number, width: number, height: number, onClick: () => void): Node {
  const node = createNode(`Button_${text}`, width, height);
  node.setPosition(new Vec3(x, y, 0));
  parent.addChild(node);
  inheritLayer(node, parent);
  addPanel(node, width, height, new Color(37, 99, 235, 255));

  const label = addLabel(node, text, 0, 0, 18, new Color(255, 255, 255, 255), width, height);
  label.lineHeight = height;

  const button = node.addComponent(Button);
  button.transition = Button.Transition.COLOR;
  button.normalColor = new Color(37, 99, 235, 255);
  button.pressedColor = new Color(29, 78, 216, 255);
  button.hoverColor = new Color(59, 130, 246, 255);
  button.node.on(Button.EventType.CLICK, onClick);
  return node;
}

function inheritLayer(node: Node, parent: Node): void {
  const runtimeNode = node as Node & { layer?: number };
  const runtimeParent = parent as Node & { layer?: number };
  if (typeof runtimeParent.layer === 'number') {
    runtimeNode.layer = runtimeParent.layer;
  }
}

function getRuntimeNodeName(node: Node | null | undefined): string {
  const runtimeName = (node as unknown as { name?: string } | null | undefined)?.name;
  const legacyName = (node as unknown as { _name?: string } | null | undefined)?._name;
  return runtimeName ?? legacyName ?? '';
}

interface RuntimeDirector {
  on?(eventType: string, callback: () => void): void;
  getScene?(): Node | null;
}

interface RuntimeSpriteToken {
  node: Node;
  sprite: Sprite;
  fallbackNode: Node;
  fallbackGraphics: Graphics;
  fallbackLabel: Label;
  width: number;
  height: number;
  resourcePath: string;
}

interface RuntimeActorNode extends RuntimeSpriteToken {
  label: Label;
}

interface RuntimeCleanupNode extends Node {
  __propHideSeekCleanups?: Array<() => void>;
}

interface WeChatGameRuntime {
  getSystemInfoSync?(): {
    windowWidth?: number;
    windowHeight?: number;
    safeArea?: ScreenSafeArea;
  };
  onTouchStart?(callback: (event: WeChatTouchEvent) => void): void;
  onTouchMove?(callback: (event: WeChatTouchEvent) => void): void;
  onTouchEnd?(callback: (event: WeChatTouchEvent) => void): void;
  onTouchCancel?(callback: (event: WeChatTouchEvent) => void): void;
  offTouchStart?(callback: (event: WeChatTouchEvent) => void): void;
  offTouchMove?(callback: (event: WeChatTouchEvent) => void): void;
  offTouchEnd?(callback: (event: WeChatTouchEvent) => void): void;
  offTouchCancel?(callback: (event: WeChatTouchEvent) => void): void;
}

interface WeChatTouchEvent {
  changedTouches?: WeChatTouch[];
}

interface WeChatTouch {
  identifier?: number | string;
  clientX: number;
  clientY: number;
}
