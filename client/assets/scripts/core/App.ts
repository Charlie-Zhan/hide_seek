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
  Node,
  resources,
  Size,
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
import { SoloComputerSeekerController } from '../gameplay/SoloComputerSeekerController';
import type { LocalGameSnapshot } from '../gameplay/LocalGameTypes';
import { MapManager, type LocalMapConfigInput } from '../map/MapManager';
import { GameHUD } from '../ui/GameHUD';
import { LobbyUI } from '../ui/LobbyUI';
import { ResultPanel } from '../ui/ResultPanel';
import { RoomUI } from '../ui/RoomUI';

const { ccclass } = _decorator;
const runtimeLogger = new Logger('RuntimeSceneBridge');
const SOLO_PLAYER_ID = 'solo_player_1';

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
  addButton(root, 'Solo Practice', 0, -82, 260, 48, () => {
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
  const mapRoot = createNode('RuntimeMapRoot', 820, 360);
  const propNodes = new Map<string, Node>();
  const playerNodes = new Map<string, RuntimeActorNode>();
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
    onState: (message) => renderState(message),
    onGameEvent: (message) => {
      eventLabel.string = `Event: ${message.event.type}`;
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
  addPanel(mapRoot, 820, 360, new Color(30, 41, 59, 255));
  addMapGuide(mapRoot);
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

  addButton(root, 'Up', -372, -230, 70, 40, () => setMove(0, 1));
  addButton(root, 'Left', -446, -276, 70, 40, () => setMove(-1, 0));
  addButton(root, 'Stop', -372, -276, 70, 40, () => setMove(0, 0));
  addButton(root, 'Right', -298, -276, 70, 40, () => setMove(1, 0));
  addButton(root, 'Down', -372, -322, 70, 40, () => setMove(0, -1));
  const actionLabel = addLabel(root, 'Action', 372, -280, 16, new Color(226, 232, 240, 255), 170, 28);
  addButton(root, 'Action', 372, -320, 130, 46, () => sendAction());
  const touchInputCleanup = installWeChatGameTouchInput(setMove, sendAction);
  touchLabel.string = touchInputCleanup
    ? 'Touch controls active: left move, right action'
    : 'Button controls active';

  function renderState(message: ServerStateMessage): void {
    inputState.latestState = message;
    const countdownSeconds = Math.ceil(Math.max(0, message.timeLeftMs) / 1000);
    const hiders = message.players.filter((player) => player.role === 'hider');
    const capturedHiders = hiders.filter((player) => player.state === 'captured');
    const localPlayer = getLocalMatchPlayer(message);
    const isBlindSeeker = localPlayer?.role === 'seeker' && message.phase === 'hide';
    hud.updateViewModel({
      phase: message.phase,
      countdownMs: message.timeLeftMs,
      role: localPlayer?.role ?? '',
      attackCountRemaining: message.attackCountRemaining,
      remainingAttacks: message.attackCountRemaining,
      currentPropId: localPlayer?.currentPropId ?? null,
      capturedCount: capturedHiders.length,
      totalHiders: hiders.length,
      scores: Object.entries(message.scores).map(([playerId, score]) => ({
        playerId,
        displayName: playerId,
        score
      })),
      v2Objective: { enabled: false, label: '', progressText: '', completed: false, rewardText: '', hintStatus: 'none' },
      v2AmbientEvent: { enabled: false, status: 'none', title: '', timeLeftMs: null, publicAreaLabel: '' }
    });
    const display = hud.getDisplayState();
    stateLabel.string = `Room ${message.roomId} | ${display.phaseText} | ${countdownSeconds}s | round ${message.roundIndex + 1}`;
    hudLabel.string = `You: ${localPlayer?.role ?? 'spectator'} | Captured ${display.capturedText} | Attacks ${message.attackCountRemaining} | Move ${inputState.moveX},${inputState.moveY}`;
    playersLabel.string = message.players
      .map((player) => {
        const score = message.scores[player.playerId] ?? player.score;
        return `${player.displayName}: ${player.role}, ${player.state}, score ${score}`;
      })
      .join('\n');
    actionLabel.string = localPlayer?.role === 'seeker' ? 'Cone Attack' : 'Switch Prop';
    mapRoot.active = !isBlindSeeker;
    blindLabel.string = isBlindSeeker ? 'Hiders are arranging the scene' : '';
    renderProps(message);
    renderPlayers(message);

    if (message.phase === 'result' || message.phase === 'match_end') {
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
    const localPlayer = inputState.latestState ? getLocalMatchPlayer(inputState.latestState) : null;
    const action = localPlayer?.role === 'seeker' ? 'attack' : 'switch_prop';
    sendInput(action);
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

  function renderProps(message: ServerStateMessage): void {
    for (const prop of message.props) {
      let node = propNodes.get(prop.propInstanceId);
      if (!node) {
        node = createMapToken(prop.propConfigId, getPropColor(prop.propConfigId), 24, 24);
        mapRoot.addChild(node);
        inheritLayer(node, mapRoot);
        propNodes.set(prop.propInstanceId, node);
      }

      node.active = !prop.isDestroyed;
      node.setPosition(toMapPosition(prop.position.x, prop.position.y));
    }
  }

  function renderPlayers(message: ServerStateMessage): void {
    for (const player of message.players) {
      let actor = playerNodes.get(player.playerId);
      if (!actor) {
        actor = createActorToken(player.displayName);
        mapRoot.addChild(actor.node);
        inheritLayer(actor.node, mapRoot);
        playerNodes.set(player.playerId, actor);
      }

      const hidden = player.state === 'invisible_in_preview' || player.state === 'seeker_locked';
      actor.node.active = !hidden;
      actor.node.setPosition(toMapPosition(player.position.x, player.position.y));
      actor.label.string = player.role === 'hider' && player.currentPropId ? player.currentPropId : player.displayName;
      actor.badge.fillColor = getPlayerColor(player.role, player.captured === true);
      actor.badge.clear();
      actor.badge.circle(0, 5, 14);
      actor.badge.fill();
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
  const mapRoot = createNode('RuntimeSoloMapRoot', 820, 360);
  const propNodes = new Map<string, Node>();
  const playerNodes = new Map<string, RuntimeActorNode>();
  const inputState = {
    moveX: 0,
    moveY: 0,
    engine: null as LocalGameEngine | null,
    computerSeeker: new SoloComputerSeekerController({ humanPlayerId: SOLO_PLAYER_ID }),
    latestSnapshot: null as LocalGameSnapshot | null
  };
  let lastTickMs = Date.now();

  addPanel(root, 960, 640, new Color(15, 23, 42, 255));
  addLabel(root, 'Solo Practice', 0, 272, 28, new Color(248, 250, 252, 255), 820, 38);
  const stateLabel = addLabel(root, 'Loading solo match...', 0, 236, 18, new Color(226, 232, 240, 255), 840, 32);
  mapRoot.setPosition(new Vec3(0, 30, 0));
  root.addChild(mapRoot);
  inheritLayer(mapRoot, root);
  addPanel(mapRoot, 820, 360, new Color(30, 41, 59, 255));
  addMapGuide(mapRoot);
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
  const restartButton = addButton(resultRoot, 'Restart Solo', -88, -190, 170, 42, () => {
    startSoloMatch();
    resultStatus.string = '';
  });
  const lobbyButton = addButton(resultRoot, 'Lobby', 110, -190, 130, 42, () => {
    sessionState.startMultiplayerMode();
    new SceneLoader().load(SceneName.Lobby);
  });
  resultRoot.active = false;

  addButton(root, 'Up', -372, -230, 70, 40, () => setMove(0, 1));
  addButton(root, 'Left', -446, -276, 70, 40, () => setMove(-1, 0));
  addButton(root, 'Stop', -372, -276, 70, 40, () => setMove(0, 0));
  addButton(root, 'Right', -298, -276, 70, 40, () => setMove(1, 0));
  addButton(root, 'Down', -372, -322, 70, 40, () => setMove(0, -1));
  const actionLabel = addLabel(root, 'Action', 372, -280, 16, new Color(226, 232, 240, 255), 170, 28);
  addButton(root, 'Action', 372, -320, 130, 46, () => useAction());
  const touchInputCleanup = installWeChatGameTouchInput(setMove, useAction);
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
        inputState.engine = new LocalGameEngine(
          createLocalGameSetupFromMap(
            mapManager.getLoadedMapState(),
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
        mapRoot.removeAllChildren();
        addPanel(mapRoot, 820, 360, new Color(30, 41, 59, 255));
        addMapGuide(mapRoot);
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
      eventLabel.string = result.accepted
        ? `Attack: ${result.destroyedPropIds.length} props, ${result.capturedPlayerIds.length} hiders`
        : `Attack ignored: ${result.reason ?? 'not available'}`;
    } else {
      const switched = engine.switchDisguise(SOLO_PLAYER_ID);
      eventLabel.string = switched ? `Switched to ${getSoloLocalPlayer(engine.getSnapshot())?.currentPropId ?? ''}` : '';
    }

    renderSnapshot(engine.getSnapshot());
  }

  function renderSnapshot(snapshot: LocalGameSnapshot): void {
    inputState.latestSnapshot = snapshot;
    const localPlayer = getSoloLocalPlayer(snapshot);
    const hiders = snapshot.players.filter((player) => player.role === 'hider');
    const capturedHiders = hiders.filter((player) => player.captured);
    const isBlindSeeker = localPlayer?.role === 'seeker' && snapshot.phase === 'hide';
    hud.updateViewModel({
      phase: snapshot.phase,
      countdownMs: snapshot.phaseRemainingMs,
      role: localPlayer?.role ?? 'spectator',
      attackCountRemaining: snapshot.attackCountRemaining,
      remainingAttacks: snapshot.attackCountRemaining,
      currentPropId: localPlayer?.currentPropId ?? null,
      isCaptured: localPlayer?.captured ?? false,
      currentScore: localPlayer?.score ?? null,
      capturedCount: capturedHiders.length,
      totalHiders: hiders.length,
      scores: snapshot.players.map((player) => ({
        playerId: player.playerId,
        displayName: player.displayName,
        score: player.score
      })),
      v2Objective: { enabled: false, label: '', progressText: '', completed: false, rewardText: '', hintStatus: 'none' },
      v2AmbientEvent: { enabled: false, status: 'none', title: '', timeLeftMs: null, publicAreaLabel: '' }
    });

    const display = hud.getDisplayState();
    stateLabel.string = `${display.phaseText} | ${display.countdownText} | round ${snapshot.roundIndex + 1}`;
    hudLabel.string = `You: ${display.roleText} | Captured ${display.capturedText} | Attacks ${snapshot.attackCountRemaining} | Move ${inputState.moveX},${inputState.moveY}`;
    playersLabel.string = snapshot.players
      .map((player) => `${player.displayName}: ${player.role}, ${player.state}, score ${player.score}`)
      .join('\n');
    actionLabel.string = localPlayer?.role === 'seeker' ? 'Cone Attack' : 'Switch Prop';
    mapRoot.active = !isBlindSeeker;
    blindLabel.string = isBlindSeeker ? 'Hiders are arranging the scene' : '';
    renderSoloProps(snapshot);
    renderSoloPlayers(snapshot);

    if (snapshot.phase === 'result' || snapshot.phase === 'match_end') {
      showSoloResult(snapshot);
    } else {
      resultRoot.active = false;
      resultPanel.hide();
    }
  }

  function renderSoloProps(snapshot: LocalGameSnapshot): void {
    for (const prop of snapshot.props) {
      let node = propNodes.get(prop.instanceId);
      if (!node) {
        node = createMapToken(prop.propId, getPropColor(prop.propId), 24, 24);
        mapRoot.addChild(node);
        inheritLayer(node, mapRoot);
        propNodes.set(prop.instanceId, node);
      }

      node.active = !prop.destroyed;
      node.setPosition(toMapPosition(prop.position.x, prop.position.y));
    }
  }

  function renderSoloPlayers(snapshot: LocalGameSnapshot): void {
    for (const player of snapshot.players) {
      let actor = playerNodes.get(player.playerId);
      if (!actor) {
        actor = createActorToken(player.displayName);
        mapRoot.addChild(actor.node);
        inheritLayer(actor.node, mapRoot);
        playerNodes.set(player.playerId, actor);
      }

      const hidden = player.state === 'invisible_in_preview' || player.state === 'seeker_locked';
      actor.node.active = !hidden;
      actor.node.setPosition(toMapPosition(player.position.x, player.position.y));
      actor.label.string =
        player.role === 'hider' && player.state !== 'hider_moving_as_character'
          ? player.currentPropId
          : player.displayName;
      actor.badge.fillColor = getPlayerColor(player.role, player.captured);
      actor.badge.clear();
      actor.badge.circle(0, 5, 14);
      actor.badge.fill();
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
      setMove: (x, y) => setMove(roundInputAxis(x), roundInputAxis(y)),
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

function addMapGuide(parent: Node): void {
  addLabel(parent, 'Kitchen map', 0, 150, 18, new Color(148, 163, 184, 255), 760, 28);
  addPanelAt(parent, -260, 54, 160, 80, new Color(51, 65, 85, 255));
  addPanelAt(parent, 0, -4, 230, 54, new Color(51, 65, 85, 255));
  addPanelAt(parent, 292, 46, 120, 120, new Color(51, 65, 85, 255));
}

function addPanelAt(parent: Node, x: number, y: number, width: number, height: number, color: Color): void {
  const node = createNode('MapBlock', width, height);
  node.setPosition(new Vec3(x, y, 0));
  parent.addChild(node);
  inheritLayer(node, parent);
  addPanel(node, width, height, color);
}

function createMapToken(text: string, color: Color, width: number, height: number): Node {
  const node = createNode(`Token_${text}`, width, height);
  addPanel(node, width, height, color);
  addLabel(node, shortTokenText(text), 0, 0, 10, new Color(255, 255, 255, 255), width, height);
  return node;
}

function createActorToken(displayName: string): RuntimeActorNode {
  const node = createNode(`Actor_${displayName}`, 42, 42);
  const badge = node.addComponent(Graphics);
  badge.fillColor = new Color(37, 99, 235, 255);
  badge.circle(0, 5, 14);
  badge.fill();
  const label = addLabel(node, displayName, 0, -17, 10, new Color(248, 250, 252, 255), 84, 18);
  return { node, badge, label };
}

function toMapPosition(x: number, y: number): Vec3 {
  const mapWidth = 820;
  const mapHeight = 360;
  const worldWidth = 1280;
  const worldHeight = 720;
  return new Vec3((x / worldWidth - 0.5) * mapWidth, (0.5 - y / worldHeight) * mapHeight, 0);
}

function getLocalMatchPlayer(message: ServerStateMessage): ServerStateMessage['players'][number] | null {
  const playerId = sessionState.getPlayerId();
  if (playerId) {
    return message.players.find((player) => player.playerId === playerId) ?? null;
  }

  const playerName = sessionState.getPlayerName();
  return message.players.find((player) => player.displayName === playerName) ?? null;
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
      originalDestroy();
    };
  }

  runtimeNode.__propHideSeekCleanups.push(cleanup);
}

function ensureCanvas(scene: RuntimeSceneNode): Node | null {
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
  editBox.fontSize = 18;
  editBox.placeholderFontSize = 18;
  editBox.fontColor = new Color(15, 23, 42, 255);
  editBox.placeholderFontColor = new Color(100, 116, 139, 255);
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

function getRuntimeNodeName(node: RuntimeSceneNode | null | undefined): string {
  return node?.name ?? node?._name ?? '';
}

interface RuntimeDirector {
  on?(eventType: string, callback: () => void): void;
  getScene?(): RuntimeSceneNode | null;
}

interface RuntimeSceneNode extends Node {
  name?: string;
  _name?: string;
}

interface RuntimeActorNode {
  node: Node;
  badge: Graphics;
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
