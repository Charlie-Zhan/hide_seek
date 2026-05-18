import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'shared/src/protocol/room.ts',
  'shared/src/protocol/messages.ts',
  'server/src/rooms/RoomService.ts',
  'server/src/net/WebSocketRoomServer.ts',
  'server/src/index.ts',
  'client/assets/scripts/network/NetworkClient.ts',
  'client/assets/scripts/network/MessageRouter.ts',
  'client/assets/scripts/core/SessionState.ts',
  'client/assets/scripts/ui/LobbyUI.ts',
  'client/assets/scripts/ui/RoomUI.ts',
  'server/tests/room-service.test.ts',
  'docs/playtest/phase-03-room-lobby-multiplayer.md'
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  fail('Missing Phase 03 paths:', missing);
}

const sharedMessages = read('shared/src/protocol/messages.ts');
const sharedRoom = read('shared/src/protocol/room.ts');
const serverPackage = JSON.parse(read('server/package.json'));

const requiredClientTypes = ['create_room', 'join_room', 'leave_room', 'set_ready', 'start_match'];
const requiredServerTypes = ['room_joined', 'room_updated', 'match_starting', 'error'];
const requiredErrorCodes = [
  'room_not_found',
  'room_full',
  'invalid_player_name',
  'duplicate_join',
  'not_in_room',
  'not_enough_players',
  'match_already_started',
  'invalid_message'
];

for (const type of [...requiredClientTypes, ...requiredServerTypes]) {
  if (!sharedMessages.includes(`'${type}'`) && !sharedRoom.includes(`'${type}'`)) {
    fail('Missing room protocol message type.', [type]);
  }
}

for (const code of requiredErrorCodes) {
  if (!sharedMessages.includes(`'${code}'`) && !sharedRoom.includes(`'${code}'`)) {
    fail('Missing room error code.', [code]);
  }
}

for (const symbol of ['PublicRoomState', 'PublicRoomPlayer', 'ClientRoomMessage', 'ServerRoomMessage']) {
  if (!sharedMessages.includes(symbol) && !sharedRoom.includes(symbol)) {
    fail('Missing shared room protocol symbol.', [symbol]);
  }
}

if (!serverPackage.dependencies?.ws && !serverPackage.devDependencies?.ws) {
  fail('Server package must include ws dependency for Phase 03.', []);
}

console.log('Phase 03 validation passed.');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function fail(title, details) {
  console.error(`Phase 03 validation failed. ${title}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}
