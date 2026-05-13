import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { GameEvent, GameEventMessage, ServerStateMessage } from '@prop-hide-seek/shared';
import { PlayerRole, PlayerState, RoundPhase } from '@prop-hide-seek/shared';
import { RemoteGameState } from '../assets/scripts/gameplay/RemoteGameState';
import { NetworkClient, NetworkConnectionState } from '../assets/scripts/network/NetworkClient';

describe('Phase 04 client network runtime validation', () => {
  let originalWebSocket: unknown;
  let originalWx: unknown;

  beforeEach(() => {
    originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
    originalWx = (globalThis as { wx?: unknown }).wx;
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
    delete (globalThis as { wx?: unknown }).wx;
    FakeWebSocket.latest = null;
  });

  afterEach(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
    if (originalWx === undefined) {
      delete (globalThis as { wx?: unknown }).wx;
    } else {
      (globalThis as { wx?: unknown }).wx = originalWx;
    }
  });

  it('accepts real NetworkClient state and game_event messages only when events include id and serverTimeMs', () => {
    const client = connectClient();
    const received: string[] = [];
    const errors: string[] = [];
    client.onMessage((message) => received.push(message.type));
    client.onError((message) => errors.push(message));

    FakeWebSocket.latest?.receive(JSON.stringify(createStateMessage({
      id: 'event-valid-1',
      type: 'phase_changed',
      serverTimeMs: 1000,
      phase: RoundPhase.Hide
    })));
    FakeWebSocket.latest?.receive(JSON.stringify(createGameEventMessage({
      id: 'event-valid-2',
      type: 'props_destroyed',
      serverTimeMs: 1001,
      propIds: ['crate_01']
    })));

    FakeWebSocket.latest?.receive(JSON.stringify(createStateMessage({
      type: 'phase_changed',
      serverTimeMs: 1002,
      phase: RoundPhase.Seek
    } as GameEvent)));
    FakeWebSocket.latest?.receive(JSON.stringify(createStateMessage({
      id: 'event-missing-time',
      type: 'phase_changed',
      phase: RoundPhase.Seek
    } as GameEvent)));
    FakeWebSocket.latest?.receive(JSON.stringify(createGameEventMessage({
      type: 'props_destroyed',
      serverTimeMs: 1003,
      propIds: ['bucket_01']
    } as GameEvent)));
    FakeWebSocket.latest?.receive(JSON.stringify(createGameEventMessage({
      id: 'event-message-missing-time',
      type: 'props_destroyed',
      propIds: ['bucket_02']
    } as GameEvent)));

    assert.deepEqual(received, ['state', 'game_event']);
    assert.deepEqual(errors, [
      'Ignored unknown room message.',
      'Ignored unknown room message.',
      'Ignored unknown room message.',
      'Ignored unknown room message.'
    ]);
  });

  it('rejects game_event messages missing top-level serverTimeMs before routing to handlers', () => {
    const client = connectClient();
    let routed = false;
    const errors: string[] = [];
    client.onMessage(() => {
      routed = true;
    });
    client.onError((message) => errors.push(message));

    const message = createGameEventMessage({
      id: 'event-valid-inner-time',
      type: 'hider_captured',
      serverTimeMs: 2000,
      hiderId: 'p2',
      by: 'p1'
    });
    delete (message as { serverTimeMs?: number }).serverTimeMs;

    FakeWebSocket.latest?.receive(JSON.stringify(message));

    assert.equal(routed, false);
    assert.deepEqual(errors, ['Ignored unknown room message.']);
  });
});

describe('RemoteGameState event history', () => {
  it('deduplicates matching ids without swallowing distinct ids for equivalent events', () => {
    const remoteState = new RemoteGameState();
    const firstEvent: GameEvent = {
      id: 'attack-1',
      type: 'attack',
      serverTimeMs: 3000,
      attackerId: 'p1',
      x: 10,
      y: 20,
      facingX: 1,
      facingY: 0
    };
    const differentIdSamePayload: GameEvent = {
      ...firstEvent,
      id: 'attack-2'
    };

    remoteState.pushGameEvent(firstEvent);
    remoteState.pushGameEvent({ ...firstEvent });
    remoteState.pushGameEvent(differentIdSamePayload);

    assert.deepEqual(remoteState.getEvents().map((event) => event.id), ['attack-1', 'attack-2']);
  });
});

class FakeWebSocket {
  public static latest: FakeWebSocket | null = null;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  public readonly sent: string[] = [];

  public constructor(public readonly url: string) {
    FakeWebSocket.latest = this;
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
}

function connectClient(): NetworkClient {
  const client = new NetworkClient();
  client.connect('ws://test-room-server');
  FakeWebSocket.latest?.open();
  assert.equal(client.getConnectionState(), NetworkConnectionState.Connected);
  return client;
}

function createStateMessage(event: GameEvent): ServerStateMessage {
  return {
    type: 'state',
    serverTimeMs: 5000,
    serverTick: 10,
    roomId: 'room_01',
    phase: RoundPhase.Seek,
    timeLeftMs: 30000,
    players: [
      {
        playerId: 'p1',
        displayName: 'Seeker',
        role: PlayerRole.Seeker,
        state: PlayerState.SeekerLocked,
        position: { x: 0, y: 0 },
        facingDeg: 0,
        score: 0
      }
    ],
    props: [
      {
        propInstanceId: 'crate_01',
        propConfigId: 'wooden_crate',
        position: { x: 20, y: 0 },
        rotationDeg: 0,
        isDestroyed: false
      }
    ],
    events: [event],
    scores: { p1: 0 },
    attackCountRemaining: 2,
    roundIndex: 0,
    seekerPlayerId: 'p1'
  };
}

function createGameEventMessage(event: GameEvent): GameEventMessage {
  return {
    type: 'game_event',
    serverTimeMs: 5001,
    event
  };
}
