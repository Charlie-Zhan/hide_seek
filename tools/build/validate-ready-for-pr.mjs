import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const issues = [];
const warnings = [];

const phaseValidators = Array.from({ length: 9 }, (_, index) => {
  const phase = String(index).padStart(2, '0');
  return {
    scriptName: `validate:phase${phase}`,
    scriptPath: `tools/build/validate-phase-${phase}.mjs`,
    expectedCommand: `node tools/build/validate-phase-${phase}.mjs`
  };
});

const requiredPaths = [
  'AGENTS.md',
  '.gitignore',
  '.dockerignore',
  'Dockerfile',
  'docker-compose.yml',
  'client/settings/wechat-minigame.json',
  'client/assets/scripts/network/NetworkConfig.ts',
  'server/src/config/ServerConfig.ts',
  'tools/build/validate-ready-for-pr.mjs',
  'docs/playtest/final-handoff.md',
  'package.json'
];

const expectedPlaytestPaths = [
  'docs/playtest/docker-test-runbook.md',
  'docs/playtest/real-device-test-runbook.md',
  'docs/playtest/real-device-session-template.md',
  'docs/release/pr-ready-checklist.md'
];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) {
    issues.push(`Missing required ready-pr path: ${path}`);
  }
}

for (const { scriptPath } of phaseValidators) {
  if (!existsSync(join(root, scriptPath))) {
    issues.push(`Missing phase validator: ${scriptPath}`);
  }
}

for (const path of expectedPlaytestPaths) {
  if (!existsSync(join(root, path))) {
    issues.push(`Missing real-device handoff path expected before PR: ${path}`);
  }
}

const packageJson = readJsonIfExists('package.json');
if (packageJson != null) {
  const scripts = packageJson.scripts ?? {};

  for (const { scriptName, expectedCommand } of phaseValidators) {
    if (scripts[scriptName] !== expectedCommand) {
      issues.push(`package.json ${scriptName} must run: ${expectedCommand}`);
    }
  }

  if (scripts['validate:ready-pr'] !== 'node tools/build/validate-ready-for-pr.mjs') {
    issues.push('package.json validate:ready-pr must run node tools/build/validate-ready-for-pr.mjs');
  }

  if (scripts['smoke:lan-ws'] !== 'npx tsx tools/playtest/lan-websocket-smoke.mjs') {
    issues.push('package.json smoke:lan-ws must run npx tsx tools/playtest/lan-websocket-smoke.mjs');
  }

  if (scripts['lan:endpoints'] !== 'node tools/playtest/print-lan-endpoints.mjs') {
    issues.push('package.json lan:endpoints must run node tools/playtest/print-lan-endpoints.mjs');
  }

  if (scripts['server:lan'] !== 'npx tsx tools/playtest/start-lan-room-server.mjs') {
    issues.push('package.json server:lan must run npx tsx tools/playtest/start-lan-room-server.mjs');
  }

  const smokeScripts = Object.keys(scripts).filter((name) => name.includes('smoke'));
  if (smokeScripts.length === 0) {
    issues.push('package.json must expose at least one smoke script entry');
  }

  const expectedDockerScripts = {
    'docker:build': 'docker compose build',
    'docker:server': 'docker compose up --build room-server',
    'docker:test': 'docker compose run --rm verify',
    'docker:typecheck': 'docker compose run --rm typecheck',
    'docker:smoke': 'docker compose run --rm smoke-local-ws'
  };

  for (const [scriptName, expectedCommand] of Object.entries(expectedDockerScripts)) {
    if (scripts[scriptName] !== expectedCommand) {
      issues.push(`package.json ${scriptName} must run: ${expectedCommand}`);
    }
  }
}

const gitignore = readIfExists('.gitignore');
if (gitignore != null) {
  if (/^build\/\s*$/m.test(gitignore)) {
    issues.push('.gitignore must not use an unanchored build/ pattern because it hides tools/build validators');
  }

  assertTerms('.gitignore', gitignore, [
    '/build/',
    'client/build/',
    'client/HideSeek/'
  ]);
}

const dockerfile = readIfExists('Dockerfile');
if (dockerfile != null) {
  assertTerms('Dockerfile', dockerfile, [
    'node:20',
    'npm ci',
    'HOST=0.0.0.0',
    'PORT=8787',
    'EXPOSE 8787',
    '@prop-hide-seek/server'
  ]);
}

const lanSmoke = readIfExists('tools/playtest/lan-websocket-smoke.mjs');
if (lanSmoke != null) {
  assertTerms('tools/playtest/lan-websocket-smoke.mjs', lanSmoke, [
    '0.0.0.0',
    '8787',
    'WS_SMOKE_CONNECT_HOST',
    'local-websocket-smoke.mjs'
  ]);
}

const lanInfo = readIfExists('tools/playtest/lan-network-info.mjs');
if (lanInfo != null) {
  assertTerms('tools/playtest/lan-network-info.mjs', lanInfo, [
    'networkInterfaces',
    'IPv4',
    'formatLanWebSocketEndpoints',
    'ws://'
  ]);
}

const lanServer = readIfExists('tools/playtest/start-lan-room-server.mjs');
if (lanServer != null) {
  assertTerms('tools/playtest/start-lan-room-server.mjs', lanServer, [
    'HOST',
    '0.0.0.0',
    'PORT',
    '8787',
    '../../server/src/index.ts',
    'printLanWebSocketEndpoints'
  ]);
}

const dockerCompose = readIfExists('docker-compose.yml');
if (dockerCompose != null) {
  assertTerms('docker-compose.yml', dockerCompose, [
    'room-server',
    '8787:8787',
    'verify',
    'typecheck',
    'smoke-local-ws',
    'HOST: 0.0.0.0'
  ]);
}

const wechatSettings = readIfExists('client/settings/wechat-minigame.json');
if (wechatSettings != null) {
  assertTerms('client/settings/wechat-minigame.json', wechatSettings, [
    'wechatgame',
    'landscape',
    'assets/scripts/network/NetworkConfig.ts',
    'roomId'
  ]);
}

const serverConfig = readIfExists('server/src/config/ServerConfig.ts');
if (serverConfig != null) {
  if (!/process\.env\.HOST/.test(serverConfig)) {
    issues.push('ServerConfig must expose HOST configuration through process.env.HOST');
  }

  if (!/process\.env\.PORT/.test(serverConfig)) {
    issues.push('ServerConfig must expose PORT configuration through process.env.PORT');
  }
}

const networkConfig = readIfExists('client/assets/scripts/network/NetworkConfig.ts');
if (networkConfig != null) {
  assertTerms('client/assets/scripts/network/NetworkConfig.ts', networkConfig, [
    'DEFAULT_ROOM_SERVER_URL',
    'ROOM_SERVER_URL_STORAGE_KEY',
    'ROOM_SERVER_URL_GLOBAL_KEY',
    'defaultRoomServerUrl',
    'resolveRoomServerUrl',
    'NetworkConfig'
  ]);

  if (!/DEFAULT_ROOM_SERVER_URL\s*=\s*['"`]wss?:\/\//.test(networkConfig)) {
    issues.push('NetworkConfig must expose a default WebSocket server URL entry');
  }

  const hasRuntimeOverride =
    /resolveRoomServerUrl/.test(networkConfig) &&
    /__PROP_HIDE_SEEK_ROOM_SERVER_URL__/.test(networkConfig) &&
    /prop_hide_seek_room_server_url/.test(networkConfig);

  if (/localhost|127\.0\.0\.1/.test(networkConfig) && !hasRuntimeOverride) {
    warnings.push(
      'NetworkConfig defaultRoomServerUrl currently points at local development; final real-device testing must set the tested endpoint before PR.'
    );
  }
}

const finalHandoff = readIfExists('docs/playtest/final-handoff.md');
if (finalHandoff != null) {
  assertTerms('docs/playtest/final-handoff.md', finalHandoff, [
    'Final Handoff',
    'Completed Phase Records',
    'Automated Validation',
    'Smoke Command',
    'Real Device Items Still To Fill',
    'server:lan',
    'lan:endpoints',
    'smoke:lan-ws',
    'docker:smoke',
    'docker:server',
    '__PROP_HIDE_SEEK_ROOM_SERVER_URL__',
    'prop_hide_seek_room_server_url',
    'Do Not Commit Build Artifacts',
    'not claim real-device testing has passed'
  ]);
}

if (warnings.length > 0) {
  console.warn('Ready-for-PR validation warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (issues.length > 0) {
  console.error('Ready-for-PR validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Ready-for-PR validation passed.');

function readIfExists(path) {
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) {
    return null;
  }

  return readFileSync(absolutePath, 'utf8');
}

function readJsonIfExists(path) {
  const content = readIfExists(path);
  if (content == null) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    issues.push(`Invalid JSON in ${path}: ${error.message}`);
    return null;
  }
}

function assertTerms(path, content, terms) {
  for (const term of terms) {
    if (!content.includes(term)) {
      issues.push(`Missing ready-pr term in ${path}: ${term}`);
    }
  }
}
