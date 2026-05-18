import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'client/assets/scripts/wechat/WeChatPlatform.ts',
  'client/assets/scripts/input/TouchInputAdapter.ts',
  'client/assets/scripts/network/NetworkClient.ts',
  'client/assets/scripts/network/NetworkConfig.ts',
  'client/settings/wechat-minigame.json',
  'client/tests/wechat-platform.test.ts',
  'client/tests/touch-input-adapter.test.ts',
  'client/tests/network-reconnect.test.ts',
  'client/tests/native-fallback.test.ts',
  'tools/wechat/native-fallback.js',
  'tools/wechat/prepare-devtools.mjs',
  'docs/playtest/phase-05-wechat-minigame-integration.md',
  'docs/playtest/phase-05-first-package-inventory.md'
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  fail('Missing Phase 05 paths:', missing);
}

const wechatPlatform = read('client/assets/scripts/wechat/WeChatPlatform.ts');
const touchInput = read('client/assets/scripts/input/TouchInputAdapter.ts');
const networkClient = read('client/assets/scripts/network/NetworkClient.ts');
const networkConfig = read('client/assets/scripts/network/NetworkConfig.ts');
const wechatSettings = read('client/settings/wechat-minigame.json');
const wechatDevtoolsPrepare = read('tools/wechat/prepare-devtools.mjs');
const nativeFallback = read('tools/wechat/native-fallback.js');
const nativeFallbackTest = read('client/tests/native-fallback.test.ts');
const packageInventory = read('docs/playtest/phase-05-first-package-inventory.md');

const requiredTerms = [
  [wechatPlatform, 'getLaunchRoomId'],
  [wechatPlatform, 'createShareRoomPayload'],
  [wechatPlatform, 'getOrCreatePlayerProfile'],
  [wechatPlatform, 'getStorageSync'],
  [touchInput, 'TouchInputAdapter'],
  [touchInput, 'createLandscapeControlLayout'],
  [touchInput, 'handleTouchStarts'],
  [networkClient, 'NetworkReconnectState'],
  [networkClient, 'onReconnectStateChange'],
  [networkClient, 'setRoomResumeTarget'],
  [networkConfig, 'reconnectMaxAttempts'],
  [wechatSettings, 'wechatgame'],
  [wechatSettings, 'landscape'],
  [wechatSettings, 'roomId'],
  [wechatDevtoolsPrepare, 'compileType'],
  [wechatDevtoolsPrepare, 'urlCheck'],
  [wechatDevtoolsPrepare, 'game.json'],
  [wechatDevtoolsPrepare, "join(projectRoot, 'client', 'build', 'wechatgame')"],
  [wechatDevtoolsPrepare, "join(projectRoot, 'client', 'HideSeek', 'wechatgame')"],
  [wechatDevtoolsPrepare, 'PROP_HIDE_SEEK_WECHAT_GAME_ROOT'],
  [wechatDevtoolsPrepare, 'nativeFallback'],
  [wechatDevtoolsPrepare, 'PROP_HIDE_SEEK_NATIVE_FALLBACK'],
  [wechatDevtoolsPrepare, 'application.start'],
  [wechatDevtoolsPrepare, "System.import('./application.js')"],
  [wechatDevtoolsPrepare, 'prop-hide-seek-fallback.js'],
  [nativeFallback, 'getLaunchOptionsSync'],
  [nativeFallback, 'onShow'],
  [nativeFallback, 'shareAppMessage'],
  [nativeFallback, 'switch_prop'],
  [nativeFallback, 'attack'],
  [nativeFallbackTest, 'FakeWx'],
  [nativeFallbackTest, 'auto-joins launch rooms'],
  [nativeFallbackTest, 'dispatches attack for seekers and switch_prop for hiders'],
  [packageInventory, 'kitchen_01'],
  [packageInventory, 'Actual WeChat package size']
];

for (const [content, term] of requiredTerms) {
  if (!content.includes(term)) {
    fail('Missing Phase 05 term.', [term]);
  }
}

const forbiddenPatterns = [
  /leaderboard/i,
  /season/i,
  /monetization/i,
  /random.?match/i,
  /p2p/i,
  /scan/i,
  /sprint/i
];

for (const [path, content] of [
  ['client/assets/scripts/wechat/WeChatPlatform.ts', wechatPlatform],
  ['client/assets/scripts/input/TouchInputAdapter.ts', touchInput],
  ['client/assets/scripts/network/NetworkClient.ts', networkClient]
]) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      fail('Forbidden later-phase/MVP feature term.', [`${path}: ${pattern}`]);
    }
  }
}

console.log('Phase 05 validation passed.');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function fail(title, details) {
  console.error(`Phase 05 validation failed. ${title}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}
