import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { WebSocketRoomServer } from '../src/net/WebSocketRoomServer.js';
import { RoomService } from '../src/rooms/RoomService.js';

interface TestMessage {
  type: string;
  playerId?: string;
  code?: string;
  phase?: string;
  serverTick?: number;
  attackCountRemaining?: number;
  v2Objectives?: Array<{
    objectiveId: string;
    objectiveType: string;
    position: {
      x: number;
      y: number;
    };
    radius: number;
    requiredHoldMs: number;
    progressMs: number;
    completed: boolean;
    completedBy?: string;
    reward: number;
  }>;
  v2Events?: Array<{
    eventId: string;
    eventType: string;
    status: string;
    position: {
      x: number;
      y: number;
    };
    radius: number;
    startsAtMs: number;
    endsAtMs: number;
  }>;
  players?: Array<{
    playerId: string;
    role: string;
    state: string;
    position: {
      x: number;
      y: number;
    };
  }>;
  events?: Array<{
    id?: string;
    type: string;
    serverTimeMs?: number;
    eventId?: string;
    eventType?: string;
    startsInMs?: number;
  }>;
  room?: {
    roomId: string;
    status: string;
    players: Array<{
      playerId: string;
      playerName: string;
      ready: boolean;
      connected: boolean;
      isOwner: boolean;
    }>;
  };
}

test('websocket clients can create, join, ready, and start a room', async () => {
  const roomServer = new WebSocketRoomServer(new RoomService(), {
    host: '127.0.0.1',
    port: 0
  });
  roomServer.start();
  await roomServer.waitUntilListening();

  const clientA = await connectClient(roomServer.getUrl());
  const clientB = await connectClient(roomServer.getUrl());

  try {
    const welcomeA = await clientA.waitForMessage('welcome');
    const welcomeB = await clientB.waitForMessage('welcome');
    assert.equal(typeof welcomeA.playerId, 'string');
    assert.equal(typeof welcomeB.playerId, 'string');

    clientA.send({ type: 'create_room', playerName: 'Alice' });
    const joinedA = await clientA.waitForMessage('room_joined');
    assert.ok(joinedA.room);
    assert.equal(joinedA.room.players.length, 1);
    assert.equal(joinedA.room.players[0]?.isOwner, true);
    const roomId = joinedA.room.roomId;

    clientA.send({ type: 'start_match' });
    const notEnough = await clientA.waitForMessage('error');
    assert.equal(notEnough.code, 'not_enough_players');

    clientB.send({ type: 'join_room', roomId, playerName: 'Bob' });
    const joinedB = await clientB.waitForMessage('room_joined');
    assert.equal(joinedB.room?.roomId, roomId);
    assert.equal(joinedB.room?.players.length, 2);
    const updatedA = await clientA.waitForPredicate((message) => message.room?.players.length === 2);
    assert.equal(updatedA.room?.players.length, 2);

    clientA.send({ type: 'set_ready', ready: true });
    clientB.send({ type: 'set_ready', ready: true });
    await clientA.waitForPredicate((message) => message.room?.players.filter((player) => player.ready).length === 2);
    await clientB.waitForPredicate((message) => message.room?.players.filter((player) => player.ready).length === 2);

    clientA.send({ type: 'start_match' });
    const startingA = await clientA.waitForMessage('match_starting');
    const startingB = await clientB.waitForMessage('match_starting');
    assert.equal(startingA.room?.status, 'playing');
    assert.equal(startingB.room?.status, 'playing');

    const stateA = await clientA.waitForMessage('state');
    const stateB = await clientB.waitForMessage('state');
    assert.equal(stateA.phase, 'preview');
    assert.equal(stateB.phase, 'preview');
    assert.equal(stateA.players?.length, 2);
    assert.ok(stateA.players?.every((player) => player.position.x === 0 && player.position.y === 0));
    assert.ok(stateA.events?.every((event) => typeof event.id === 'string' && typeof event.serverTimeMs === 'number'));
    assert.equal(stateA.attackCountRemaining, 0);
    assert.deepEqual(stateA.v2Objectives, []);
    assert.deepEqual(stateA.v2Events, []);
  } finally {
    clientA.close();
    clientB.close();
    roomServer.close();
  }
});

test('websocket state broadcasts typed v2 fields when explicitly enabled', async () => {
  const roomServer = new WebSocketRoomServer(new RoomService(), {
    host: '127.0.0.1',
    port: 0,
    tickRateHz: 20,
    matchConfig: {
      previewDurationMs: 1,
      hideDurationMs: 1,
      seekDurationMs: 5000,
      v2ObjectivesEnabled: true,
      v2EventsEnabled: true,
      v2ObjectiveHoldMs: 500,
      v2ObjectiveRadiusPx: 24,
      v2EventStartDelayMs: 100,
      v2EventDurationMs: 200,
      v2EventRadiusPx: 56,
    },
  });
  roomServer.start();
  await roomServer.waitUntilListening();

  const clientA = await connectClient(roomServer.getUrl());
  const clientB = await connectClient(roomServer.getUrl());

  try {
    await clientA.waitForMessage('welcome');
    await clientB.waitForMessage('welcome');
    const roomId = await createReadyRoom(clientA, clientB);

    clientA.send({ type: 'start_match' });
    await clientA.waitForMessage('match_starting');
    await clientB.waitForMessage('match_starting');

    const previewState = await clientA.waitForMessage('state');
    assert.equal(previewState.phase, 'preview');
    assert.equal(previewState.v2Objectives?.length, 1);
    assert.equal(previewState.v2Objectives[0]?.objectiveType, 'hold_point');
    assert.equal(typeof previewState.v2Objectives[0]?.objectiveId, 'string');
    assert.equal(typeof previewState.v2Objectives[0]?.position.x, 'number');
    assert.equal(typeof previewState.v2Objectives[0]?.position.y, 'number');
    assert.equal(typeof previewState.v2Objectives[0]?.radius, 'number');
    assert.equal(typeof previewState.v2Objectives[0]?.requiredHoldMs, 'number');
    assert.equal(typeof previewState.v2Objectives[0]?.progressMs, 'number');
    assert.equal(typeof previewState.v2Objectives[0]?.completed, 'boolean');
    assert.equal(typeof previewState.v2Objectives[0]?.reward, 'number');
    assert.equal(previewState.v2Events?.length, 1);
    assert.equal(previewState.v2Events[0]?.eventType, 'local_disruption');
    assert.equal(previewState.v2Events[0]?.status, 'hint');
    assert.equal(typeof previewState.v2Events[0]?.eventId, 'string');
    assert.equal(typeof previewState.v2Events[0]?.position.x, 'number');
    assert.equal(typeof previewState.v2Events[0]?.position.y, 'number');
    assert.equal(typeof previewState.v2Events[0]?.radius, 'number');
    assert.equal(typeof previewState.v2Events[0]?.startsAtMs, 'number');
    assert.equal(typeof previewState.v2Events[0]?.endsAtMs, 'number');

    const lifecycleState = await clientA.waitForPredicate((message) =>
      message.type === 'state'
      && message.phase === 'seek'
      && message.events?.some((event) => event.type === 'v2_event_hint') === true
    );
    const lifecycleEvent = lifecycleState.events?.find((event) => event.type === 'v2_event_hint');
    assert.equal(typeof lifecycleEvent?.id, 'string');
    assert.equal(typeof lifecycleEvent?.serverTimeMs, 'number');
    assert.equal(typeof lifecycleEvent?.eventId, 'string');
    assert.equal(lifecycleEvent?.eventType, 'local_disruption');
    assert.equal(typeof lifecycleEvent?.startsInMs, 'number');
    assert.equal(lifecycleState.room?.roomId, undefined);
    assert.equal(typeof roomId, 'string');
  } finally {
    clientA.close();
    clientB.close();
    roomServer.close();
  }
});

test('websocket player_input ignores non movement actions outside the input whitelist', async () => {
  const roomServer = new WebSocketRoomServer(new RoomService(), {
    host: '127.0.0.1',
    port: 0,
    tickRateHz: 20,
    matchConfig: {
      previewDurationMs: 1,
      hideDurationMs: 1,
      seekDurationMs: 5000,
    },
  });
  roomServer.start();
  await roomServer.waitUntilListening();

  const clientA = await connectClient(roomServer.getUrl());
  const clientB = await connectClient(roomServer.getUrl());

  try {
    await clientA.waitForMessage('welcome');
    await clientB.waitForMessage('welcome');
    await createReadyRoom(clientA, clientB);

    clientA.send({ type: 'start_match' });
    await clientA.waitForMessage('match_starting');
    await clientB.waitForMessage('match_starting');
    const seekState = await clientA.waitForPredicate((message) => message.type === 'state' && message.phase === 'seek');
    assert.equal(seekState.attackCountRemaining, 2);

    clientA.send({ type: 'player_input', moveX: 0, moveY: 0, action: 'complete_objective' });
    clientA.send({ type: 'player_input', moveX: 0, moveY: 0, action: 'trigger_v2_event' });

    const nextState = await clientA.waitForPredicate((message) =>
      message.type === 'state'
      && message.phase === 'seek'
      && (message.serverTick ?? 0) > (seekState.serverTick ?? 0)
    );
    assert.equal(nextState.attackCountRemaining, 2);
    assert.equal(nextState.events?.some((event) => event.type === 'attack'), false);
  } finally {
    clientA.close();
    clientB.close();
    roomServer.close();
  }
});

interface TestClient {
  send(message: object): void;
  close(): void;
  waitForMessage(type: string): Promise<TestMessage>;
  waitForPredicate(predicate: (message: TestMessage) => boolean): Promise<TestMessage>;
}

async function createReadyRoom(clientA: TestClient, clientB: TestClient): Promise<string> {
  clientA.send({ type: 'create_room', playerName: 'Alice' });
  const joinedA = await clientA.waitForMessage('room_joined');
  assert.ok(joinedA.room);
  const roomId = joinedA.room.roomId;

  clientB.send({ type: 'join_room', roomId, playerName: 'Bob' });
  await clientB.waitForMessage('room_joined');
  await clientA.waitForPredicate((message) => message.room?.players.length === 2);

  clientA.send({ type: 'set_ready', ready: true });
  clientB.send({ type: 'set_ready', ready: true });
  await clientA.waitForPredicate((message) => message.room?.players.filter((player) => player.ready).length === 2);
  await clientB.waitForPredicate((message) => message.room?.players.filter((player) => player.ready).length === 2);

  return roomId;
}

function connectClient(url: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages: TestMessage[] = [];
    socket.on('message', (data) => {
      messages.push(JSON.parse(data.toString()) as TestMessage);
    });
    socket.once('open', () => resolve(createTestClient(socket, messages)));
    socket.once('error', reject);
  });
}

function createTestClient(socket: WebSocket, messages: TestMessage[]): TestClient {
  return {
    send: (message) => socket.send(JSON.stringify(message)),
    close: () => socket.close(),
    waitForMessage: (type) => waitForBufferedPredicate(socket, messages, (message) => message.type === type),
    waitForPredicate: (predicate) => waitForBufferedPredicate(socket, messages, predicate),
  };
}

function waitForBufferedPredicate(
  socket: WebSocket,
  messages: TestMessage[],
  predicate: (message: TestMessage) => boolean
): Promise<TestMessage> {
  const existing = messages.find(predicate);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for websocket test message.'));
    }, 2000);

    const onMessage = (data: WebSocket.RawData): void => {
      const message = JSON.parse(data.toString()) as TestMessage;
      if (!predicate(message)) {
        return;
      }

      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };

    socket.on('message', onMessage);
  });
}
