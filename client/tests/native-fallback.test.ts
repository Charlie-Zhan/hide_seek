import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fallbackScript = readFileSync(new URL('../../tools/wechat/native-fallback.js', import.meta.url), 'utf8');

describe('WeChat native fallback debug runtime', () => {
  it('starts against a mocked wx canvas and sends create_room after socket open', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://10.0.0.8:8787' });
    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.serverUrl, 'ws://10.0.0.8:8787');

    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    assert.equal(socket.url, 'ws://10.0.0.8:8787');
    assert.deepEqual(socket.sentMessages(), []);

    socket.open();

    assert.deepEqual(socket.sentMessages(), [
      { type: 'create_room', playerName: 'Player' }
    ]);
  });

  it('auto-joins launch rooms and applies launch serverUrl overrides', () => {
    const runtime = createRuntime({
      launchOptions: {
        query: {
          roomId: 'room_9',
          serverUrl: 'ws://192.168.1.50:8787'
        }
      }
    });

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    const socket = runtime.wx.sockets[0];
    assert.equal(socket.url, 'ws://192.168.1.50:8787');

    socket.open();

    assert.deepEqual(socket.sentMessages(), [
      { type: 'join_room', roomId: 'ROOM_9', playerName: 'Player' }
    ]);
  });

  it('handles onShow room re-entry and exposes a Join Room button for pending launch room ids', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.wx.emitShow({ query: { roomId: 'room_show', serverUrl: 'ws://10.0.0.9:8787' } });
    const autoJoinSocket = runtime.wx.sockets[0];
    autoJoinSocket.open();

    assert.equal(runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.joinRoomId, 'ROOM_SHOW');
    assert.deepEqual(autoJoinSocket.sentMessages(), [
      { type: 'join_room', roomId: 'ROOM_SHOW', playerName: 'Player' }
    ]);

    runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.connected = false;
    runtime.context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.socket = null;
    runtime.click('Join Room');
    const buttonSocket = runtime.wx.sockets[1];
    buttonSocket.open();

    assert.deepEqual(buttonSocket.sentMessages(), [
      { type: 'join_room', roomId: 'ROOM_SHOW', playerName: 'Player' }
    ]);
  });

  it('registers and invokes share payloads that include roomId and serverUrl', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://192.168.1.50:8787' });
    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    socket.open();
    socket.message({
      type: 'room_joined',
      playerId: 'p1',
      room: roomState('ROOM42')
    });

    assert.deepEqual(toPlainObject(runtime.wx.shareFactory?.()), {
      title: 'Join my Prop Hide & Seek room',
      query: 'roomId=ROOM42&serverUrl=ws%3A%2F%2F192.168.1.50%3A8787'
    });

    runtime.click('Share');

    assert.deepEqual(toPlainObject(runtime.wx.lastSharedPayload), {
      title: 'Join my Prop Hide & Seek room',
      query: 'roomId=ROOM42&serverUrl=ws%3A%2F%2F192.168.1.50%3A8787'
    });
  });

  it('dispatches attack for seekers and switch_prop for hiders', () => {
    const runtime = createRuntime();

    runtime.start({ serverUrl: 'ws://127.0.0.1:8787' });
    runtime.click('Create Room');
    const socket = runtime.wx.sockets[0];
    socket.open();
    socket.message({ type: 'welcome', playerId: 'p1' });
    socket.message(gameState({ playerId: 'p1', role: 'seeker' }));

    runtime.click('Attack');

    assert.equal(socket.sentMessages().at(-1)?.type, 'player_input');
    assert.equal(socket.sentMessages().at(-1)?.action, 'attack');

    socket.message(gameState({ playerId: 'p1', role: 'hider' }));
    runtime.click('Switch Prop');

    assert.equal(socket.sentMessages().at(-1)?.type, 'player_input');
    assert.equal(socket.sentMessages().at(-1)?.action, 'switch_prop');
  });
});

function createRuntime(options: { launchOptions?: { query?: Record<string, unknown> } } = {}) {
  const wx = new FakeWx(options.launchOptions ?? {});
  const canvas = new FakeCanvas();
  const context: Record<string, any> = {
    console,
    encodeURIComponent,
    setInterval: () => 1,
    clearInterval: () => undefined,
    Math,
    JSON,
    Promise,
    wx,
    canvas
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(fallbackScript, context, { filename: 'tools/wechat/native-fallback.js' });

  return {
    context,
    wx,
    canvas,
    start(startOptions: Record<string, unknown> = {}) {
      context.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__(startOptions);
    },
    click(label: string) {
      const button = context.__PROP_HIDE_SEEK_NATIVE_FALLBACK_STATE__.buttons.find(
        (candidate: { label: string }) => candidate.label === label
      );
      assert.ok(button, `Expected button ${label}`);
      wx.emitTouchEnd({
        changedTouches: [
          {
            clientX: button.x + button.w / 2,
            clientY: button.y + button.h / 2
          }
        ]
      });
    }
  };
}

function roomState(roomId: string) {
  return {
    roomId,
    status: 'waiting',
    minPlayers: 2,
    maxPlayers: 4,
    players: [
      {
        playerId: 'p1',
        playerName: 'Player',
        displayName: 'Player',
        ready: false,
        connected: true,
        isOwner: true
      }
    ]
  };
}

function gameState(localPlayer: { playerId: string; role: 'seeker' | 'hider' }) {
  return {
    type: 'state',
    serverTick: 1,
    serverTimeMs: 1000,
    roomId: 'ROOM42',
    phase: 'seek',
    roundIndex: 0,
    seekerPlayerId: localPlayer.role === 'seeker' ? localPlayer.playerId : 'seeker_2',
    timeLeftMs: 30000,
    attackCountRemaining: 2,
    players: [
      {
        playerId: localPlayer.playerId,
        displayName: 'Player',
        role: localPlayer.role,
        state: localPlayer.role === 'seeker' ? 'seeker_active' : 'hider_disguised_moving',
        position: { x: 640, y: 360 },
        facingDeg: 0,
        score: 0
      }
    ],
    props: [],
    events: [],
    scores: { [localPlayer.playerId]: 0 }
  };
}

function toPlainObject(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

class FakeWx {
  public readonly sockets: FakeSocketTask[] = [];
  public shareFactory: (() => unknown) | null = null;
  public lastSharedPayload: unknown = null;
  private touchEndHandler: ((event: unknown) => void) | null = null;
  private showHandler: ((options: unknown) => void) | null = null;

  public constructor(private readonly launchOptions: { query?: Record<string, unknown> }) {}

  public createCanvas() {
    return new FakeCanvas();
  }

  public getSystemInfoSync() {
    return {
      windowWidth: 960,
      windowHeight: 640,
      screenWidth: 960,
      screenHeight: 640,
      pixelRatio: 1,
      platform: 'devtools'
    };
  }

  public getLaunchOptionsSync() {
    return this.launchOptions;
  }

  public connectSocket(options: { url: string }) {
    const socket = new FakeSocketTask(options.url);
    this.sockets.push(socket);
    return socket;
  }

  public onTouchEnd(handler: (event: unknown) => void) {
    this.touchEndHandler = handler;
  }

  public emitTouchEnd(event: unknown) {
    this.touchEndHandler?.(event);
  }

  public onShow(handler: (options: unknown) => void) {
    this.showHandler = handler;
  }

  public emitShow(options: unknown) {
    this.showHandler?.(options);
  }

  public onShareAppMessage(factory: () => unknown) {
    this.shareFactory = factory;
  }

  public shareAppMessage(payload: unknown) {
    this.lastSharedPayload = payload;
  }
}

class FakeSocketTask {
  private openHandler: (() => void) | null = null;
  private messageHandler: ((event: { data: string }) => void) | null = null;
  private errorHandler: ((event: { errMsg?: string }) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private readonly sent: string[] = [];

  public constructor(public readonly url: string) {}

  public onOpen(handler: () => void) {
    this.openHandler = handler;
  }

  public onMessage(handler: (event: { data: string }) => void) {
    this.messageHandler = handler;
  }

  public onError(handler: (event: { errMsg?: string }) => void) {
    this.errorHandler = handler;
  }

  public onClose(handler: () => void) {
    this.closeHandler = handler;
  }

  public send(options: { data: string; fail?: (error: { errMsg?: string }) => void }) {
    this.sent.push(options.data);
  }

  public close() {
    this.closeHandler?.();
  }

  public open() {
    this.openHandler?.();
  }

  public message(message: unknown) {
    this.messageHandler?.({ data: JSON.stringify(message) });
  }

  public error(errMsg = 'socket error') {
    this.errorHandler?.({ errMsg });
  }

  public sentMessages() {
    return this.sent.map((data) => JSON.parse(data));
  }
}

class FakeCanvas {
  public width = 960;
  public height = 640;
  private readonly context = new FakeCanvasContext();

  public getContext() {
    return this.context;
  }
}

class FakeCanvasContext {
  public fillStyle = '';
  public strokeStyle = '';
  public font = '';
  public textAlign = '';
  public textBaseline = '';

  public clearRect() {}
  public fillRect() {}
  public strokeRect() {}
  public fillText() {}
  public beginPath() {}
  public arc() {}
  public fill() {}
  public moveTo() {}
  public arcTo() {}
  public closePath() {}
}
