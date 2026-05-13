import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { WebSocketRoomServer } from '../../server/src/net/WebSocketRoomServer.js';
import { RoomService } from '../../server/src/rooms/RoomService.js';

const DEFAULT_TIMEOUT_MS = 3000;
const host = process.env.WS_SMOKE_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.WS_SMOKE_PORT ?? '0', 10);
const connectHost = process.env.WS_SMOKE_CONNECT_HOST ?? (host === '0.0.0.0' ? '127.0.0.1' : host);

const roomServer = new WebSocketRoomServer(new RoomService(), {
  host,
  port,
  tickRateHz: 20,
});

let clientA;
let clientB;

try {
  roomServer.start();
  await roomServer.waitUntilListening();
  const listeningUrl = roomServer.getUrl();
  const serverUrl = replaceUrlHost(listeningUrl, connectHost);

  clientA = await connectClient(serverUrl);
  clientB = await connectClient(serverUrl);

  const welcomeA = await clientA.waitForMessage('welcome');
  const welcomeB = await clientB.waitForMessage('welcome');
  assertString(welcomeA.playerId, 'welcomeA.playerId');
  assertString(welcomeB.playerId, 'welcomeB.playerId');

  clientA.send({ type: 'create_room', playerName: 'SmokeA' });
  const joinedA = await clientA.waitForMessage('room_joined');
  const roomId = joinedA.room?.roomId;
  assertString(roomId, 'roomId');

  clientB.send({ type: 'join_room', roomId, playerName: 'SmokeB' });
  await clientB.waitForMessage('room_joined');
  await clientA.waitForPredicate((message) => message.room?.players?.length === 2);

  clientA.send({ type: 'set_ready', ready: true });
  clientB.send({ type: 'set_ready', ready: true });
  await clientA.waitForPredicate(hasTwoReadyPlayers);
  await clientB.waitForPredicate(hasTwoReadyPlayers);

  clientA.send({ type: 'start_match' });
  await clientA.waitForMessage('match_starting');
  await clientB.waitForMessage('match_starting');

  const state = await clientA.waitForPredicate((message) => message.type === 'state' && message.phase === 'preview');
  const v2Objectives = state.v2Objectives ?? [];
  const v2Events = state.v2Events ?? [];
  const events = state.events ?? [];

  if (!Array.isArray(v2Objectives) || v2Objectives.length !== 0) {
    throw new Error('Expected v2Objectives to default to an empty array.');
  }
  if (!Array.isArray(v2Events) || v2Events.length !== 0) {
    throw new Error('Expected v2Events to default to an empty array.');
  }
  if (!events.every((event) => typeof event.id === 'string' && typeof event.serverTimeMs === 'number')) {
    throw new Error('Expected every state event to include id and serverTimeMs.');
  }

  const result = {
    ok: true,
    bindHost: host,
    serverUrl,
    listeningUrl,
    roomId,
    playerIds: [welcomeA.playerId, welcomeB.playerId],
    phase: state.phase,
    v2Objectives,
    v2Events,
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      serverTimeMs: event.serverTimeMs,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await closeClient(clientA);
  await closeClient(clientB);
  roomServer.close();
  await delay(50);
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages = [];

    const failTimer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out connecting to ${url}.`));
    }, DEFAULT_TIMEOUT_MS);

    socket.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
    });
    socket.once('open', () => {
      clearTimeout(failTimer);
      resolve(createSmokeClient(socket, messages));
    });
    socket.once('error', (error) => {
      clearTimeout(failTimer);
      reject(error);
    });
  });
}

function createSmokeClient(socket, messages) {
  return {
    send(message) {
      socket.send(JSON.stringify(message));
    },
    close() {
      return closeSocket(socket);
    },
    waitForMessage(type) {
      return waitForPredicate(socket, messages, (message) => message.type === type);
    },
    waitForPredicate(predicate) {
      return waitForPredicate(socket, messages, predicate);
    },
  };
}

function waitForPredicate(socket, messages, predicate) {
  const existing = messages.find(predicate);
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for websocket smoke message.'));
    }, DEFAULT_TIMEOUT_MS);

    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
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

function hasTwoReadyPlayers(message) {
  return message.room?.players?.filter((player) => player.ready).length === 2;
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
}

function replaceUrlHost(url, nextHost) {
  const parsedUrl = new URL(url);
  parsedUrl.hostname = nextHost;
  return parsedUrl.toString();
}

async function closeClient(client) {
  if (client === undefined) {
    return;
  }

  await client.close();
}

function closeSocket(socket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 500);
    socket.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });

    if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
      return;
    }

    socket.close();
  });
}
