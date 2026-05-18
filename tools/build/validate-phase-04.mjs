import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'server/src/game/AuthoritativeMatch.ts',
  'server/src/game/ServerGameTypes.ts',
  'server/src/game/Geometry2D.ts',
  'server/tests/authoritative-match.test.ts',
  'client/assets/scripts/gameplay/RemoteGameState.ts',
  'client/assets/scripts/gameplay/ServerStateApplier.ts',
  'client/assets/scripts/input/NetworkInputSender.ts',
  'shared/src/protocol/messages.ts',
  'shared/src/protocol/events.ts',
  'docs/playtest/phase-04-server-authority-sync.md'
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  fail('Missing Phase 04 paths:', missing);
}

const sharedMessages = read('shared/src/protocol/messages.ts');
const sharedEvents = read('shared/src/protocol/events.ts');
const serverEngine = read('server/src/game/AuthoritativeMatch.ts');

const requiredTerms = [
  "'player_input'",
  "'state'",
  'attackCountRemaining',
  'seekerPlayerId',
  "'attack'",
  "'props_destroyed'",
  "'hider_captured'",
  "'round_ended'"
];

for (const term of requiredTerms) {
  if (!sharedMessages.includes(term) && !sharedEvents.includes(term) && !serverEngine.includes(term)) {
    fail('Missing authoritative sync term.', [term]);
  }
}

const forbiddenServerPatterns = [
  /client.*hit/i,
  /client.*score/i,
  /random.?match/i,
  /leaderboard/i,
  /task/i,
  /random.?event/i
];

for (const pattern of forbiddenServerPatterns) {
  if (pattern.test(serverEngine)) {
    fail('Forbidden later-phase/client-authority pattern in server engine.', [String(pattern)]);
  }
}

console.log('Phase 04 validation passed.');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function fail(title, details) {
  console.error(`Phase 04 validation failed. ${title}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}
