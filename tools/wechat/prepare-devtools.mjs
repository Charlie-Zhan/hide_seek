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
const nativeFallbackEnabled = isNativeFallbackEnabled();

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
if (nativeFallbackEnabled) {
  writeNativeFallbackGameJs();
} else {
  prepareCocosGameJs();
}

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
console.log(`nativeFallback=${nativeFallbackEnabled ? 'enabled' : 'disabled'}`);
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
  if (nativeFallbackEnabled) {
    if (!gameJs.includes("require('./prop-hide-seek-fallback.js')")) {
      fail('game.js is missing the native WeChat fallback loader.');
    }
    if (!gameJs.includes('__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__')) {
      fail('game.js must start the native WeChat fallback when explicitly enabled.');
    }
    if (gameJs.includes('application.start') || gameJs.includes("System.import('./application.js')")) {
      fail('game.js must not start the Cocos application in native fallback mode.');
    }
  } else {
    if (!gameJs.includes('application.start') || !gameJs.includes("System.import('./application.js')")) {
      fail('game.js must preserve the standard Cocos startup by default.');
    }
    if (gameJs.includes('__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__')) {
      fail('game.js must not start the native fallback unless PROP_HIDE_SEEK_NATIVE_FALLBACK=1.');
    }
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

function prepareCocosGameJs() {
  const currentGameJs = readFileSync(gameJsPath, 'utf8');
  const cocosGameJs = isFallbackOnlyGameJs(currentGameJs)
    ? createCocosGameJs()
    : currentGameJs;
  const withoutOldOverrides = stripDevtoolsOverrides(cocosGameJs);
  writeFileSync(gameJsPath, prependDevtoolsOverrides(withoutOldOverrides), 'utf8');
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

function isNativeFallbackEnabled() {
  return process.env.PROP_HIDE_SEEK_NATIVE_FALLBACK === '1' ||
    process.env.PROP_HIDE_SEEK_NATIVE_FALLBACK === 'true';
}

function isFallbackOnlyGameJs(gameJs) {
  return gameJs.includes('__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__') &&
    !gameJs.includes("System.import('./application.js')") &&
    !gameJs.includes('application.start');
}

function stripDevtoolsOverrides(gameJs) {
  return gameJs
    .replace(/globalThis\.__PROP_HIDE_SEEK_ROOM_SERVER_URL__\s*=\s*["'`][^"'`]+["'`];\r?\n?/g, '')
    .replace(/globalThis\.__PROP_HIDE_SEEK_ENABLE_DEV_ROOM_HELPER__\s*=\s*true;\r?\n?/g, '')
    .replace(/globalThis\.__PROP_HIDE_SEEK_NATIVE_FALLBACK_DEBUG_AVAILABLE__\s*=\s*true;\r?\n?/g, '')
    .replace(/^\s*\r?\n/, '');
}

function prependDevtoolsOverrides(gameJs) {
  return `'use strict';

globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = ${JSON.stringify(roomServerUrl)};
globalThis.__PROP_HIDE_SEEK_ENABLE_DEV_ROOM_HELPER__ = true;
globalThis.__PROP_HIDE_SEEK_NATIVE_FALLBACK_DEBUG_AVAILABLE__ = true;

${gameJs.replace(/^'use strict';\s*/, '')}`;
}

function createCocosGameJs() {
  return `function __initApp () {  // init app
globalThis.__wxRequire = require;  // FIX: require cannot work in separate engine
require('./web-adapter');
const firstScreen = require('./first-screen');

// Polyfills bundle.
require("./src/polyfills.bundle.js");
// SystemJS support.
require("./src/system.bundle.js");

// Adapt for IOS, swap if opposite
const info = wx.getSystemInfoSync();
if (canvas){
    var _w = canvas.width;
    var _h = canvas.height;
    if (info.screenWidth < info.screenHeight) {
        if (canvas.width > canvas.height) {
            _w = canvas.height;
            _h = canvas.width;
        }
    } else {
        if (canvas.width < canvas.height) {
            _w = canvas.height;
            _h = canvas.width;
        }
    }
    canvas.width = _w;
    canvas.height = _h;
}
// Adjust initial canvas size
if (canvas && window.devicePixelRatio >= 2) {canvas.width *= info.devicePixelRatio; canvas.height *= info.devicePixelRatio;}

const importMap = require("./src/import-map.js").default;
System.warmup({
    importMap,
    importMapUrl: './src/import-map.js',
    defaultHandler: (urlNoSchema) => {
        require('.' + urlNoSchema);
    },
    handlers: {
        'plugin:': (urlNoSchema) => {
            requirePlugin(urlNoSchema);
        },
        'project:': (urlNoSchema) => {
            require(urlNoSchema);
        },
    },
});

firstScreen.start('false', 'true', 'false').then(() => {
    return System.import('./application.js');
}).then((module) => {
    return firstScreen.setProgress(0.2).then(() => Promise.resolve(module));
}).then(({ Application }) => {
    return new Application();
}).then((application) => {
    return firstScreen.setProgress(0.4).then(() => Promise.resolve(application));
}).then((application) => {
    return onApplicationCreated(application);
}).catch((err) => {
    console.error(err);
});

function onApplicationCreated(application) {
    return System.import('cc').then((module) => {
        return firstScreen.setProgress(0.6).then(() => Promise.resolve(module));
    }).then((cc) => {
        require('./engine-adapter');
        return application.init(cc);
    }).then(() => {
        return firstScreen.end().then(() => application.start());
    });
}

}  // init app

// NOTE: on WeChat Android end, we can only get the correct screen size at the second tick of game.
var sysInfo = wx.getSystemInfoSync();
if (sysInfo.platform.toLocaleLowerCase() === 'android') {
    GameGlobal.requestAnimationFrame (__initApp);
} else {
    __initApp();
}
`;
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
