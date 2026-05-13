import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  NetworkClient,
  NetworkConnectionState,
  NetworkReconnectState
} from '../assets/scripts/network/NetworkClient';

describe('Phase 05 NetworkClient reconnect and room restore', () => {
  let originalWebSocket: unknown;
  let originalWx: unknown;

  beforeEach(() => {
    originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
    originalWx = (globalThis as { wx?: unknown }).wx;
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
    delete (globalThis as { wx?: unknown }).wx;
    FakeWebSocket.instances = [];
    FakeWeChatSocketTask.instances = [];
  });

  afterEach(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
    if (originalWx === undefined) {
      delete (globalThis as { wx?: unknown }).wx;
    } else {
      (globalThis as { wx?: unknown }).wx = originalWx;
    }
  });

  it('automatically reconnects for a short window and sends join_room to restore the room', async () => {
    const client = new NetworkClient();
    const reconnectStates: NetworkReconnectState[] = [];
    const errors: string[] = [];
    client.configureReconnect({ enabled: true, delayMs: 1, maxAttempts: 2, maxElapsedMs: 500 });
    client.onReconnectStateChange((info) => reconnectStates.push(info.state));
    client.onError((message) => errors.push(message));

    client.connect('ws://room-server');
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    assert.equal(client.getConnectionState(), NetworkConnectionState.Connected);

    assert.equal(client.send({ type: 'join_room', roomId: 'ab12', playerName: 'Alice' }), true);
    firstSocket.closeFromServer({ code: 1006, reason: 'network lost' });

    await waitFor(() => FakeWebSocket.instances.length === 2);
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();

    assert.deepEqual(parseSent(secondSocket), [
      { type: 'join_room', roomId: 'AB12', playerName: 'Alice' }
    ]);
    assert.equal(client.getReconnectState(), NetworkReconnectState.RestoringRoom);

    secondSocket.receive(JSON.stringify(createRoomJoinedMessage('AB12', 'player_2', 'Alice')));

    assert.equal(client.getReconnectState(), NetworkReconnectState.Reconnected);
    assert.deepEqual(reconnectStates, [
      NetworkReconnectState.Waiting,
      NetworkReconnectState.Connecting,
      NetworkReconnectState.RestoringRoom,
      NetworkReconnectState.Reconnected
    ]);
    assert.deepEqual(errors, ['Network disconnected, reconnecting.']);

    client.disconnect();
  });

  it('reports reconnect failure after configured attempts are exhausted', async () => {
    const client = new NetworkClient();
    const reconnectStates: NetworkReconnectState[] = [];
    const errors: string[] = [];
    client.configureReconnect({ enabled: true, delayMs: 1, maxAttempts: 1, maxElapsedMs: 500 });
    client.onReconnectStateChange((info) => reconnectStates.push(info.state));
    client.onError((message) => errors.push(message));

    client.connect('ws://room-server');
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].closeFromServer({ code: 1006 });

    await waitFor(() => FakeWebSocket.instances.length === 2);
    FakeWebSocket.instances[1].closeFromServer({ code: 1006 });

    await waitFor(() => client.getReconnectState() === NetworkReconnectState.Failed);

    assert.equal(client.getConnectionState(), NetworkConnectionState.Disconnected);
    assert.deepEqual(reconnectStates, [
      NetworkReconnectState.Waiting,
      NetworkReconnectState.Connecting,
      NetworkReconnectState.Failed
    ]);
    assert.deepEqual(errors, [
      'Network disconnected, reconnecting.',
      'Reconnect failed.'
    ]);
  });

  it('uses wx.connectSocket and applies the same reconnect restore path', async () => {
    const client = new NetworkClient();
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { wx?: unknown }).wx = {
      connectSocket: ({ url }: { url: string }) => new FakeWeChatSocketTask(url)
    };
    client.configureReconnect({ enabled: true, delayMs: 1, maxAttempts: 2, maxElapsedMs: 500 });
    client.setRoomResumeTarget('wx99', 'Wei');

    client.connect('wss://wechat-room-server');
    const firstTask = FakeWeChatSocketTask.instances[0];
    firstTask.open();
    firstTask.closeFromServer({ code: 1006 });

    await waitFor(() => FakeWeChatSocketTask.instances.length === 2);
    const secondTask = FakeWeChatSocketTask.instances[1];
    secondTask.open();

    assert.deepEqual(parseSent(secondTask), [
      { type: 'join_room', roomId: 'WX99', playerName: 'Wei' }
    ]);

    client.disconnect();
  });
});

class FakeWebSocket {
  public static instances: FakeWebSocket[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  public readonly sent: string[] = [];

  public constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(code?: number, reason?: string): void {
    this.onclose?.({ code, reason });
  }

  public open(): void {
    this.onopen?.();
  }

  public receive(data: string): void {
    this.onmessage?.({ data });
  }

  public closeFromServer(event: { code?: number; reason?: string } = {}): void {
    this.onclose?.(event);
  }
}

class FakeWeChatSocketTask {
  public static instances: FakeWeChatSocketTask[] = [];
  private openHandler: (() => void) | null = null;
  private messageHandler: ((event: { data: unknown }) => void) | null = null;
  private closeHandler: ((event: { code?: number; reason?: string }) => void) | null = null;
  private errorHandler: ((event: { errMsg?: string }) => void) | null = null;
  public readonly sent: string[] = [];

  public constructor(public readonly url: string) {
    FakeWeChatSocketTask.instances.push(this);
  }

  public onOpen(callback: () => void): void {
    this.openHandler = callback;
  }

  public onMessage(callback: (event: { data: unknown }) => void): void {
    this.messageHandler = callback;
  }

  public onError(callback: (event: { errMsg?: string }) => void): void {
    this.errorHandler = callback;
  }

  public onClose(callback: (event: { code?: number; reason?: string }) => void): void {
    this.closeHandler = callback;
  }

  public send(options: { data: string; fail?: (error: { errMsg?: string }) => void }): void {
    this.sent.push(options.data);
  }

  public close(options: { code?: number; reason?: string } = {}): void {
    this.closeHandler?.(options);
  }

  public open(): void {
    this.openHandler?.();
  }

  public receive(data: string): void {
    this.messageHandler?.({ data });
  }

  public error(errMsg: string): void {
    this.errorHandler?.({ errMsg });
  }

  public closeFromServer(event: { code?: number; reason?: string } = {}): void {
    this.closeHandler?.(event);
  }
}

function parseSent(socket: { sent: string[] }): unknown[] {
  return socket.sent.map((message) => JSON.parse(message) as unknown);
}

function createRoomJoinedMessage(roomId: string, playerId: string, playerName: string): unknown {
  return {
    type: 'room_joined',
    playerId,
    room: {
      roomId,
      status: 'waiting',
      mapId: 'kitchen_01',
      minPlayers: 2,
      maxPlayers: 4,
      createdAtMs: 1000,
      updatedAtMs: 1000,
      players: [
        {
          playerId,
          playerName,
          displayName: playerName,
          ready: false,
          connected: true,
          isOwner: false,
          joinedAtMs: 1000
        }
      ]
    }
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for reconnect condition.');
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
