import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = process.cwd();
const wechatGameRoot = join(root, 'client', 'HideSeek', 'wechatgame');
const projectConfigPath = join(wechatGameRoot, 'project.config.json');
const gameJsPath = join(wechatGameRoot, 'game.js');
const fallbackSourcePath = join(root, 'tools', 'wechat', 'native-fallback.js');
const fallbackRuntimePath = join(wechatGameRoot, 'prop-hide-seek-fallback.js');
const roomServerUrl = resolveDevRoomServerUrl();

if (!existsSync(projectConfigPath)) {
  fail(`Missing WeChat DevTools config: ${projectConfigPath}`);
}

const config = readJson(projectConfigPath);
config.compileType = 'game';
config.miniprogramRoot = './';
config.setting = {
  ...(config.setting ?? {}),
  urlCheck: false
};
config.condition = normalizeConditions(config.condition);

writeFileSync(projectConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
copyFileSync(fallbackSourcePath, fallbackRuntimePath);
writeNativeFallbackGameJs();

const requiredRuntimeFiles = [
  'game.js',
  'game.json',
  'prop-hide-seek-fallback.js',
  'project.config.json',
  join('assets', 'main', 'index.js'),
  join('assets', 'main', 'config.json')
];
const missing = requiredRuntimeFiles.filter((path) => !existsSync(join(wechatGameRoot, path)));
if (missing.length > 0) {
  fail(`Missing generated WeChat game runtime files:\n${missing.map((path) => `- ${path}`).join('\n')}`);
}

verifyRuntimeConfig();

console.log('WeChat DevTools project prepared for game compilation.');
console.log(`Project: ${wechatGameRoot}`);
console.log('compileType=game');
console.log('setting.urlCheck=false');
console.log('launchScene=db://assets/scenes/Lobby.scene');
console.log('nativeFallback=enabled');
console.log(`roomServerUrl=${roomServerUrl}`);

function normalizeConditions(condition) {
  const nextCondition = condition && typeof condition === 'object' ? condition : {};
  const groups = ['search', 'conversation', 'game', 'miniprogram'];

  for (const group of groups) {
    const current = nextCondition[group] && typeof nextCondition[group] === 'object'
      ? nextCondition[group]
      : {};
    nextCondition[group] = {
      current: -1,
      list: Array.isArray(current.list) ? current.list : []
    };
  }

  return nextCondition;
}

function verifyRuntimeConfig() {
  const preparedConfig = readJson(projectConfigPath);
  if (preparedConfig.compileType !== 'game') {
    fail('project.config.json must use compileType=game for WeChat Mini Game.');
  }
  if (preparedConfig.setting?.urlCheck !== false) {
    fail('project.config.json must disable urlCheck for local ws:// playtests.');
  }

  const gameJson = readJson(join(wechatGameRoot, 'game.json'));
  if (gameJson.deviceOrientation !== 'landscapeRight') {
    fail(`Expected game.json deviceOrientation=landscapeRight, got ${gameJson.deviceOrientation}.`);
  }

  const settings = readJson(join(wechatGameRoot, 'src', 'settings.json'));
  if (settings.launch?.launchScene !== 'db://assets/scenes/Lobby.scene') {
    fail(`Expected launchScene=db://assets/scenes/Lobby.scene, got ${settings.launch?.launchScene}.`);
  }

  const mainConfig = readJson(join(wechatGameRoot, 'assets', 'main', 'config.json'));
  const scenes = mainConfig.scenes ?? {};
  if (scenes['db://assets/scenes/Lobby.scene'] === undefined) {
    fail('assets/main/config.json does not register Lobby.scene.');
  }

  const gameJs = readFileSync(gameJsPath, 'utf8');
  if (!gameJs.includes(`globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = ${JSON.stringify(roomServerUrl)};`)) {
    fail('game.js is missing the DevTools room server URL override.');
  }
  if (!gameJs.includes("require('./prop-hide-seek-fallback.js')")) {
    fail('game.js is missing the native WeChat fallback loader.');
  }
  if (!gameJs.includes('__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__')) {
    fail('game.js must start the native WeChat fallback.');
  }
  if (gameJs.includes('application.start') || gameJs.includes("System.import('./application.js')")) {
    fail('game.js must not start the Cocos application in native fallback mode.');
  }

  const mainIndex = readFileSync(join(wechatGameRoot, 'assets', 'main', 'index.js'), 'utf8');
  if (!mainIndex.includes('RuntimeSceneBridge')) {
    fail('assets/main/index.js does not contain the runtime scene bridge.');
  }

  const scriptBundle = readFileSync(join(wechatGameRoot, 'src', 'chunks', 'bundle.js'), 'utf8');
  if (!scriptBundle.includes('rollupPluginModLoBabelHelpers.js')) {
    fail('src/chunks/bundle.js does not contain shared script helpers.');
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeNativeFallbackGameJs() {
  const gameJs = `'use strict';

globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = ${JSON.stringify(roomServerUrl)};
globalThis.__PROP_HIDE_SEEK_ENABLE_DEV_ROOM_HELPER__ = true;

try {
  require('./prop-hide-seek-fallback.js');
  if (typeof globalThis.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__ !== 'function') {
    throw new Error('Native fallback entry is unavailable.');
  }
  globalThis.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__({
    serverUrl: globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__,
  });
} catch (err) {
  console.error('[PropHideSeek] Failed to start native WeChat fallback.', err);
}
`;

  writeFileSync(gameJsPath, gameJs, 'utf8');
}

function resolveDevRoomServerUrl() {
  const explicit = process.env.PROP_HIDE_SEEK_ROOM_SERVER_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const lanAddress = getLanIpv4Address();
  return `ws://${lanAddress ?? '127.0.0.1'}:8787`;
}

function getLanIpv4Address() {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }
      candidates.push(entry.address);
    }
  }

  return candidates.find((address) => address.startsWith('192.168.')) ??
    candidates.find((address) => address.startsWith('10.')) ??
    candidates.find((address) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) ??
    candidates[0] ??
    null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
