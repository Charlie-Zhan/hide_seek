import { WebSocket } from 'ws';

const DEFAULT_TIMEOUT_MS = 3000;
const serverUrl = process.env.WS_SMOKE_URL ?? 'ws://127.0.0.1:8787';

let clientA;
let clientB;

try {
  clientA = await connectClient(serverUrl);
  clientB = await connectClient(serverUrl);

  const welcomeA = await clientA.waitForMessage('welcome');
  const welcomeB = await clientB.waitForMessage('welcome');
  assertString(welcomeA.playerId, 'welcomeA.playerId');
  assertString(welcomeB.playerId, 'welcomeB.playerId');

  clientA.send({ type: 'create_room', playerName: 'DevToolsA' });
  const joinedA = await clientA.waitForMessage('room_joined');
  const roomId = joinedA.room?.roomId;
  assertString(roomId, 'roomId');

  clientB.send({ type: 'join_room', roomId, playerName: 'DevToolsB' });
  await clientB.waitForMessage('room_joined');
  await clientA.waitForPredicate((message) => message.room?.players?.length === 2);

  clientA.send({ type: 'set_ready', ready: true });
  clientB.send({ type: 'set_ready', ready: true });
  await clientA.waitForPredicate(hasTwoReadyPlayers);
  await clientB.waitForPredicate(hasTwoReadyPlayers);

  clientA.send({ type: 'start_match' });
  await clientA.waitForMessage('match_starting');
  await clientB.waitForMessage('match_starting');

  const state = await clientA.waitForPredicate(
    (message) => message.type === 'state' && message.phase === 'preview'
  );

  console.log(JSON.stringify({
    ok: true,
    serverUrl,
    roomId,
    playerIds: [welcomeA.playerId, welcomeB.playerId],
    phase: state.phase,
    players: state.players?.length ?? 0,
    attackCountRemaining: state.attackCountRemaining,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    serverUrl,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await closeClient(clientA);
  await closeClient(clientB);
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
