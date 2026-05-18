import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = process.cwd();
const wechatGameRoot = resolveWechatGameRoot(root);
const projectConfigPath = join(wechatGameRoot, 'project.config.json');
const projectPrivateConfigPath = join(wechatGameRoot, 'project.private.config.json');
const gameJsonPath = join(wechatGameRoot, 'game.json');
const runtimeSettingsPath = join(wechatGameRoot, 'src', 'settings.json');
const gameJsPath = join(wechatGameRoot, 'game.js');
const gameConfigPath = join(root, 'client', 'assets', 'resources', 'configs', 'game_config.json');
const fallbackSourcePath = join(root, 'tools', 'wechat', 'native-fallback.js');
const fallbackRuntimePath = join(wechatGameRoot, 'prop-hide-seek-fallback.js');
const resourcesImportRoot = join(wechatGameRoot, 'assets', 'resources', 'import');
const kitchenMapConfigPath = join(root, 'client', 'assets', 'resources', 'configs', 'map_kitchen_01.json');
const kenneyPropsSourceRoot = join(root, 'client', 'assets', 'art', 'kenney', 'props');
const kenneyRuntimeRoot = join(wechatGameRoot, 'kenney');
const kenneyPropsRuntimeRoot = join(kenneyRuntimeRoot, 'props');
const catSpritesSourceRoot = join(root, 'client', 'assets', 'resources', 'art', 'characters', 'cats');
const catRuntimeRoot = join(wechatGameRoot, 'cats');
const catSpritesRuntimeRoot = catRuntimeRoot;
const catAnimationSourceRoot = join(root, 'client', 'assets', 'resources', 'art', 'characters', 'cat_animations');
const catAnimationRuntimeRoot = join(catRuntimeRoot, 'anim');
const generatedPropsSourceRoot = join(root, 'client', 'assets', 'resources', 'art', 'props', 'generated', 'kitchen_v2');
const generatedRuntimeRoot = join(wechatGameRoot, 'generated');
const generatedPropsRuntimeRoot = join(generatedRuntimeRoot, 'props');
const fallbackRuntimeAssetRoots = [kenneyRuntimeRoot, catRuntimeRoot, generatedRuntimeRoot];
const wechatPackageBudgetBytes = readByteBudget('PROP_HIDE_SEEK_WECHAT_PACKAGE_BUDGET_BYTES', 8 * 1024 * 1024);
const requiredKenneyRuntimeAssets = [
  'prop_wooden_crate.png',
  'prop_trash_bin.png',
  'prop_plant_pot.png',
  'prop_chair.png',
  'prop_water_bucket.png',
  'prop_food_basket.png',
  'map_stove.png',
  'map_sink.png',
  'map_counter.png'
];
const requiredCatRuntimeAssets = [
  'cat_orange_tabby.png',
  'cat_gray_tuxedo.png',
  'cat_calico.png',
  'cat_black.png',
  'cat_siamese.png'
];
const requiredCatAnimationSkin = 'cat_orange_tabby';
const requiredCatAnimationFrames = [
  'idle',
  'walk_1',
  'walk_2',
  'front_idle',
  'front_walk_1',
  'front_walk_2',
  'back_idle',
  'back_walk_1',
  'back_walk_2',
  'diag_front_idle',
  'diag_front_walk_1',
  'diag_front_walk_2',
  'diag_back_idle',
  'diag_back_walk_1',
  'diag_back_walk_2',
  'side_crouch',
  'front_crouch',
  'back_crouch',
  'diag_front_crouch',
  'diag_back_crouch',
  'side_attack_1',
  'side_attack_2',
  'front_attack_1',
  'front_attack_2',
  'back_attack_1',
  'back_attack_2',
  'diag_front_attack_1',
  'diag_front_attack_2',
  'diag_back_attack_1',
  'diag_back_attack_2',
  'attack_1',
  'attack_2',
  'reveal',
  'dizzy'
];
const requiredGeneratedPropRuntimeAssets = [
  'prop_wooden_crate.png',
  'prop_trash_bin.png',
  'prop_plant_pot.png',
  'prop_chair.png',
  'prop_water_bucket.png',
  'prop_food_basket.png',
  'map_stove.png',
  'map_sink.png',
  'map_counter.png'
];
const roomServerUrl = resolveDevRoomServerUrl();
const nativeFallbackEnabled = isNativeFallbackEnabled();
const gameRulesConfig = readJson(gameConfigPath);

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
writeLandscapeGameJson();
writeRuntimeLaunchScene();
writePrivateDevtoolsConfig();
cleanFallbackRuntimeAssets();
copyFileSync(fallbackSourcePath, fallbackRuntimePath);
if (nativeFallbackEnabled) {
  copyKenneyRuntimeAssets();
  copyCatRuntimeAssets();
  copyCatAnimationRuntimeAssets();
  copyGeneratedPropRuntimeAssets();
}
syncRuntimeJsonAssets();
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
  ...(nativeFallbackEnabled ? getNativeFallbackRequiredRuntimeFiles() : []),
  join('assets', 'main', 'index.js'),
  join('assets', 'main', 'config.json')
];
const missing = requiredRuntimeFiles.filter((path) => !existsSync(join(wechatGameRoot, path)));
if (missing.length > 0) {
  fail(`Missing generated WeChat game runtime files:\n${missing.map((path) => `- ${path}`).join('\n')}`);
}

verifyRuntimeConfig();
verifyFallbackRuntimeAssetSet();
const packageSummary = summarizeWechatGamePackage();
warnPackageBudgets(packageSummary);

console.log('WeChat DevTools project prepared for game compilation.');
console.log(`Project: ${wechatGameRoot}`);
console.log('compileType=game');
console.log('setting.urlCheck=false');
console.log('launchScene=db://assets/scenes/Lobby.scene');
console.log(`nativeFallback=${nativeFallbackEnabled ? 'enabled' : 'disabled'}`);
console.log(`roomServerUrl=${roomServerUrl}`);
printPackageSummary(packageSummary);

function resolveWechatGameRoot(projectRoot) {
  const override = process.env.PROP_HIDE_SEEK_WECHAT_GAME_ROOT;
  const candidates = [
    override ? resolve(projectRoot, override) : '',
    join(projectRoot, 'client', 'build', 'wechatgame'),
    join(projectRoot, 'client', 'HideSeek', 'wechatgame')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'project.config.json'))) {
      return candidate;
    }
  }

  return candidates[0] ?? join(projectRoot, 'client', 'build', 'wechatgame');
}

function writeLandscapeGameJson() {
  if (!existsSync(gameJsonPath)) {
    return;
  }

  const gameJson = readJson(gameJsonPath);
  gameJson.deviceOrientation = 'landscapeRight';
  writeFileSync(gameJsonPath, `${JSON.stringify(gameJson, null, 2)}\n`, 'utf8');
}

function writeRuntimeLaunchScene() {
  if (!existsSync(runtimeSettingsPath)) {
    return;
  }

  const settings = readJson(runtimeSettingsPath);
  settings.launch = {
    ...(settings.launch ?? {}),
    launchScene: 'db://assets/scenes/Lobby.scene'
  };
  writeFileSync(runtimeSettingsPath, `${JSON.stringify(settings)}\n`, 'utf8');
}

function cleanFallbackRuntimeAssets() {
  for (const runtimeRoot of fallbackRuntimeAssetRoots) {
    assertInsideWechatGame(runtimeRoot);
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

function copyKenneyRuntimeAssets() {
  copySelectedRuntimeAssets(kenneyPropsSourceRoot, kenneyPropsRuntimeRoot, requiredKenneyRuntimeAssets, 'selected Kenney runtime asset');
}

function copyCatRuntimeAssets() {
  copySelectedRuntimeAssets(catSpritesSourceRoot, catSpritesRuntimeRoot, requiredCatRuntimeAssets, 'selected cat runtime asset');
}

function copyCatAnimationRuntimeAssets() {
  mkdirSync(catAnimationRuntimeRoot, { recursive: true });
  for (const frame of requiredCatAnimationFrames) {
    const fileName = `${requiredCatAnimationSkin}_${frame}.png`;
    const sourcePath = join(catAnimationSourceRoot, fileName);
    if (!existsSync(sourcePath)) {
      fail(`Missing selected cat animation runtime asset: ${sourcePath}`);
    }
    copyFileSync(sourcePath, join(catAnimationRuntimeRoot, fileName));
  }
}

function copyGeneratedPropRuntimeAssets() {
  copySelectedRuntimeAssets(generatedPropsSourceRoot, generatedPropsRuntimeRoot, requiredGeneratedPropRuntimeAssets, 'generated prop runtime asset');
}

function copySelectedRuntimeAssets(sourceRoot, runtimeRoot, fileNames, label) {
  mkdirSync(runtimeRoot, { recursive: true });
  for (const fileName of fileNames) {
    const sourcePath = join(sourceRoot, fileName);
    if (!existsSync(sourcePath)) {
      fail(`Missing ${label}: ${sourcePath}`);
    }
    copyFileSync(sourcePath, join(runtimeRoot, fileName));
  }
}

function getNativeFallbackRequiredRuntimeFiles() {
  return [
    ...requiredKenneyRuntimeAssets.map((fileName) => join('kenney', 'props', fileName)),
    ...requiredCatRuntimeAssets.map((fileName) => join('cats', fileName)),
    ...requiredCatAnimationFrames.map((frame) => join('cats', 'anim', `${requiredCatAnimationSkin}_${frame}.png`)),
    ...requiredGeneratedPropRuntimeAssets.map((fileName) => join('generated', 'props', fileName))
  ];
}

function syncRuntimeJsonAssets() {
  syncRuntimeJsonAsset('game_config', readJson(gameConfigPath));
  syncRuntimeJsonAsset('map_kitchen_01', readJson(kitchenMapConfigPath));
}

function syncRuntimeJsonAsset(assetName, json) {
  const assetPath = findRuntimeJsonAssetPath(assetName);
  if (!assetPath) {
    fail(`Missing Cocos runtime JsonAsset for ${assetName}.`);
  }

  const payload = readJson(assetPath);
  if (!replaceRuntimeJsonAssetPayload(payload, assetName, json)) {
    fail(`Could not update Cocos runtime JsonAsset payload for ${assetName}.`);
  }
  writeFileSync(assetPath, JSON.stringify(payload), 'utf8');
}

function findRuntimeJsonAssetPath(assetName) {
  const files = listFiles(resourcesImportRoot, '.json');
  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    if (text.includes(`"${assetName}"`)) {
      return filePath;
    }
  }
  return null;
}

function replaceRuntimeJsonAssetPayload(value, assetName, json) {
  if (!Array.isArray(value)) {
    return false;
  }

  let replaced = false;
  for (const item of value) {
    if (Array.isArray(item)) {
      if (item[1] === assetName && item.length >= 3 && item[2] && typeof item[2] === 'object') {
        item[2] = json;
        replaced = true;
      }
      if (replaceRuntimeJsonAssetPayload(item, assetName, json)) {
        replaced = true;
      }
    }
  }
  return replaced;
}

function readRuntimeJsonAsset(assetName) {
  const assetPath = findRuntimeJsonAssetPath(assetName);
  if (!assetPath) {
    fail(`Missing Cocos runtime JsonAsset for ${assetName}.`);
  }

  const payload = readJson(assetPath);
  const json = findRuntimeJsonAssetPayload(payload, assetName);
  if (!json) {
    fail(`Could not read Cocos runtime JsonAsset payload for ${assetName}.`);
  }
  return json;
}

function findRuntimeJsonAssetPayload(value, assetName) {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    if (!Array.isArray(item)) {
      continue;
    }
    if (item[1] === assetName && item.length >= 3 && item[2] && typeof item[2] === 'object') {
      return item[2];
    }
    const nested = findRuntimeJsonAssetPayload(item, assetName);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function listFiles(rootPath, extension = '') {
  const results = [];
  if (!existsSync(rootPath)) {
    return results;
  }
  const entries = readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(path, extension));
    } else if (entry.isFile() && path.endsWith(extension)) {
      results.push(path);
    }
  }
  return results;
}

function verifyFallbackRuntimeAssetSet() {
  const expected = new Set(
    (nativeFallbackEnabled ? getNativeFallbackRequiredRuntimeFiles() : [])
      .map(normalizeRuntimePath)
  );
  const actual = getFallbackRuntimeAssetFiles().map((path) => normalizeRuntimePath(relative(wechatGameRoot, path)));
  const unexpected = actual.filter((path) => !expected.has(path));
  if (unexpected.length > 0) {
    fail(`Unexpected native fallback runtime assets in WeChat output:\n${unexpected.map((path) => `- ${path}`).join('\n')}`);
  }
}

function getFallbackRuntimeAssetFiles() {
  return fallbackRuntimeAssetRoots.flatMap((runtimeRoot) => listFiles(runtimeRoot));
}

function summarizeWechatGamePackage() {
  return {
    total: summarizePath(wechatGameRoot),
    cocosAssets: summarizePath(join(wechatGameRoot, 'assets')),
    nativeFallbackScript: summarizePath(fallbackRuntimePath),
    nativeFallbackAssets: summarizePaths(fallbackRuntimeAssetRoots)
  };
}

function summarizePaths(paths) {
  return paths.reduce(
    (summary, path) => {
      const next = summarizePath(path);
      summary.files += next.files;
      summary.bytes += next.bytes;
      return summary;
    },
    { files: 0, bytes: 0 }
  );
}

function summarizePath(path) {
  if (!existsSync(path)) {
    return { files: 0, bytes: 0 };
  }

  const stat = statSync(path);
  if (stat.isFile()) {
    return { files: 1, bytes: stat.size };
  }
  if (!stat.isDirectory()) {
    return { files: 0, bytes: 0 };
  }

  let files = 0;
  let bytes = 0;
  for (const filePath of listFiles(path)) {
    const fileStat = statSync(filePath);
    files += 1;
    bytes += fileStat.size;
  }
  return { files, bytes };
}

function warnPackageBudgets(summary) {
  if (summary.total.bytes > wechatPackageBudgetBytes) {
    console.warn(`WARNING packageSize over budget: ${formatBytes(summary.total.bytes)} > ${formatBytes(wechatPackageBudgetBytes)}.`);
  }
}

function printPackageSummary(summary) {
  console.log(`packageSize=${formatBytes(summary.total.bytes)} (${summary.total.files} files, budget ${formatBytes(wechatPackageBudgetBytes)})`);
  console.log(`cocosAssetsSize=${formatBytes(summary.cocosAssets.bytes)} (${summary.cocosAssets.files} files)`);
  console.log(`nativeFallbackScriptSize=${formatBytes(summary.nativeFallbackScript.bytes)} (${summary.nativeFallbackScript.files} file)`);
  console.log(`nativeFallbackCopiedAssetSize=${formatBytes(summary.nativeFallbackAssets.bytes)} (${summary.nativeFallbackAssets.files} files)`);
}

function normalizeRuntimePath(path) {
  return path.split(sep).join('/');
}

function assertInsideWechatGame(path) {
  const rootPath = resolve(wechatGameRoot);
  const targetPath = resolve(path);
  if (!targetPath.startsWith(`${rootPath}${sep}`)) {
    fail(`Refusing to mutate path outside WeChat output: ${path}`);
  }
}

function readByteBudget(envName, fallbackBytes) {
  const raw = process.env[envName];
  if (!raw) {
    return fallbackBytes;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${envName} must be a positive byte count.`);
  }
  return Math.floor(parsed);
}

function formatBytes(bytes) {
  return `${bytes} bytes / ${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

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
  if (existsSync(projectPrivateConfigPath)) {
    const privateConfig = readJson(projectPrivateConfigPath);
    if (privateConfig.setting?.urlCheck !== false) {
      fail('project.private.config.json must disable urlCheck for local ws:// playtests.');
    }
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

  const runtimeMap = readRuntimeJsonAsset('map_kitchen_01');
  const sourceMap = readJson(kitchenMapConfigPath);
  const southWestSpawn = runtimeMap.spawnPoints?.find((spawn) => spawn.id === 'test_spawn_south_west');
  const expectedSouthWestSpawn = sourceMap.spawnPoints?.find((spawn) => spawn.id === 'test_spawn_south_west');
  if (southWestSpawn?.x !== expectedSouthWestSpawn?.x || southWestSpawn?.y !== expectedSouthWestSpawn?.y) {
    fail('Runtime map_kitchen_01 JsonAsset still has stale map hider spawn coordinates.');
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
    if (!gameJs.includes('globalThis.__PROP_HIDE_SEEK_GAME_CONFIG__')) {
      fail('game.js must inject the shared gameplay config into the native fallback.');
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

function writePrivateDevtoolsConfig() {
  if (!existsSync(projectPrivateConfigPath)) {
    return;
  }
  const privateConfig = readJson(projectPrivateConfigPath);
  privateConfig.setting = {
    ...(privateConfig.setting ?? {}),
    urlCheck: false
  };
  writeFileSync(projectPrivateConfigPath, `${JSON.stringify(privateConfig, null, 2)}\n`, 'utf8');
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
globalThis.__PROP_HIDE_SEEK_GAME_CONFIG__ = ${JSON.stringify(gameRulesConfig, null, 2)};

try {
  require('./prop-hide-seek-fallback.js');
  if (typeof globalThis.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__ !== 'function') {
    throw new Error('Native fallback entry is unavailable.');
  }
  globalThis.__PROP_HIDE_SEEK_START_NATIVE_FALLBACK__({
    serverUrl: globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__,
    gameConfig: globalThis.__PROP_HIDE_SEEK_GAME_CONFIG__,
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
