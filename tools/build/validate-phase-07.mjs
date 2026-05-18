import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.cwd();
const issues = [];
const expectedMissing = [];

const requiredPaths = [
  'docs/release/phase-07-small-release-runbook.md',
  'docs/release/phase-07-faq.md',
  'docs/release/phase-07-performance-and-package-log.md',
  'docs/release/phase-07-asset-license-check.md',
  'docs/playtest/phase-07-release-readiness.md',
  'tools/build/validate-phase-07.mjs',
  'package.json'
];

const expectedWorkerPaths = [
  'docs/playtest/phase-07-regression-matrix.md',
  'docs/playtest/phase-07-balance-template.md'
];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) {
    issues.push(`Missing Phase 07 release path: ${path}`);
  }
}

for (const path of expectedWorkerPaths) {
  if (!existsSync(join(root, path))) {
    expectedMissing.push(path);
  }
}

const termChecks = [
  {
    path: 'docs/release/phase-07-small-release-runbook.md',
    terms: [
      'Release Scope',
      'Test Accounts',
      'Test Flow',
      'WeChat DevTools',
      'wss',
      'roomId',
      'resume_room',
      'Error Log Toggle',
      'PHASE07_DEBUG_LOGS',
      'Actual WeChat package size'
    ]
  },
  {
    path: 'docs/release/phase-07-faq.md',
    terms: [
      'FAQ',
      'shared entry',
      'roomId',
      'reconnect',
      'black screen',
      'package size',
      'debug logs'
    ]
  },
  {
    path: 'docs/release/phase-07-performance-and-package-log.md',
    terms: [
      'Performance Record Fields',
      'WeChat DevTools FPS',
      'Device FPS',
      'Memory MB',
      'WebSocket Average Latency MS',
      'Messages Per Match',
      'First Package Size',
      'Actual WeChat package size'
    ]
  },
  {
    path: 'docs/release/phase-07-asset-license-check.md',
    terms: [
      'Asset License Check',
      'Kenney',
      'Source URL',
      'Retrieval date',
      'license',
      'first package',
      'atlas',
      'client/assets/art/kenney/licenses'
    ]
  },
  {
    path: 'docs/playtest/phase-07-release-readiness.md',
    terms: [
      'Phase 07 Release Readiness',
      'Test Accounts',
      'Test Flow',
      'FAQ',
      'Error Log Toggle',
      'Performance Fields',
      'First Package Size',
      'Asset License Check',
      'Blocked By Other Workers',
      'MVP Forbidden Feature Scan',
      'npm run validate:phase07'
    ]
  },
  {
    path: 'docs/playtest/phase-07-regression-matrix.md',
    terms: [
      'Phase 07 Regression and Stability Matrix',
      'Lobby',
      'Room',
      'Share launch',
      'Preview',
      'Hide',
      'Seek',
      'Result',
      'MatchEnd',
      'disconnect/reconnect',
      'restart'
    ]
  },
  {
    path: 'docs/playtest/phase-07-balance-template.md',
    terms: [
      'Phase 07 Balance Playtest Template',
      '2 players',
      '3 players',
      '4 players',
      'averageCaptures',
      'fullCaptureRate',
      'attacksDepletedRate',
      'within_target'
    ]
  },
  {
    path: 'package.json',
    terms: ['validate:phase07', 'tools/build/validate-phase-07.mjs']
  }
];

for (const check of termChecks) {
  const content = readIfExists(check.path);
  if (content == null) {
    continue;
  }

  for (const term of check.terms) {
    if (!content.includes(term)) {
      issues.push(`Missing Phase 07 term in ${check.path}: ${term}`);
    }
  }
}

const keyPaths = [
  'client/settings/wechat-minigame.json',
  'client/assets/art/kenney/README.md',
  'client/assets/art/kenney/licenses/README.md',
  'tools/asset-pipeline/README.md',
  'tools/asset-pipeline/kenney_sources_phase_02.json',
  'client/assets/art/kenney/atlas_gameplay_props.json',
  'client/assets/resources/configs/game_config.json',
  'client/assets/resources/configs/map_kitchen_01.json',
  'client/assets/resources/configs/disguise_props.json'
];

for (const path of keyPaths) {
  if (!existsSync(join(root, path))) {
    issues.push(`Missing Phase 07 key path: ${path}`);
  }
}

const keyTermChecks = [
  {
    path: 'client/settings/wechat-minigame.json',
    terms: ['wechatgame', 'landscape', 'roomId']
  },
  {
    path: 'client/assets/art/kenney/licenses/README.md',
    terms: ['source URLs', 'package names', 'license files']
  },
  {
    path: 'tools/asset-pipeline/README.md',
    terms: ['kenney_sources_phase_02.json', 'raw package contents', 'first package']
  }
];

for (const check of keyTermChecks) {
  const content = readIfExists(check.path);
  if (content == null) {
    continue;
  }

  for (const term of check.terms) {
    if (!content.includes(term)) {
      issues.push(`Missing Phase 07 key term in ${check.path}: ${term}`);
    }
  }
}

const forbiddenPatterns = [
  ['seeker extra vision ability', /\bscan(ner|ning)?\b|\u626b\u63cf|\u626b\u7784/i],
  ['sprint or dash ability', /\bsprint(ing)?\b|\bdash(ing)?\b|\u51b2\u523a|\u75be\u8dd1/i],
  ['hider roll ability', /\broll(ing)?\b|\u7ffb\u6eda/i],
  [
    'container hiding',
    /container\s*hiding|hide\s*in\s*(container|cabinet|locker|closet|cupboard)|enter\s*(crate|cabinet|locker|closet|cupboard)|\u8fdb\u5165.*(\u67dc|\u7bb1|\u5bb9\u5668)|\u8eb2\u8fdb|\u5bb9\u5668\u8eb2\u85cf|\u67dc\u5b50\u8eb2\u85cf/i
  ],
  ['hider task system', /\bside\s*task(s)?\b|\bquest(s)?\b|\u8eb2\u85cf\u8005.*\u4efb\u52a1|\u5c0f\u4efb\u52a1/i],
  ['random map event system', /random\s*map\s*event|random\s*event|\u968f\u673a.*\u4e8b\u4ef6/i],
  ['paid progression or skin shop', /paid\s*skin|premium\s*skin|skin\s*shop|cosmetic\s*skin|monetization|\u4ed8\u8d39.*\u76ae\u80a4|\u76ae\u80a4.*\u4ed8\u8d39|\u6c2a\u91d1|\u5546\u57ce/i],
  ['season or ranked progression', /\bseason(s)?\b|\branked\b|\brank\s*progression\b|\u8d5b\u5b63|\u6392\u4f4d/i],
  ['p2p networking', /\bp2p\b|peer[-\s]*to[-\s]*peer/i]
];

const forbiddenScanRoots = [
  'client/assets/scripts',
  'client/assets/resources/configs',
  'server/src',
  'shared/src'
];

for (const path of listTextFiles(forbiddenScanRoots)) {
  const content = read(path);
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(content)) {
      issues.push(`Forbidden MVP feature term (${label}) in ${path}: ${pattern}`);
    }
  }
}

if (expectedMissing.length > 0) {
  issues.push(
    `Expected Phase 07 parallel-worker paths are missing: ${expectedMissing.join(', ')}`
  );
}

if (issues.length > 0) {
  console.error('Phase 07 validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }

  if (expectedMissing.length > 0) {
    console.error('');
    console.error('Expected missing items from parallel workers:');
    for (const path of expectedMissing) {
      console.error(`- ${path}`);
    }
  }

  process.exit(1);
}

console.log('Phase 07 validation passed.');

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function readIfExists(path) {
  const absolutePath = join(root, path);
  if (!existsSync(absolutePath)) {
    return null;
  }

  return readFileSync(absolutePath, 'utf8');
}

function listTextFiles(paths) {
  const files = [];
  for (const path of paths) {
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath)) {
      continue;
    }

    collectTextFiles(path, files);
  }

  return files;
}

function collectTextFiles(path, files) {
  const absolutePath = join(root, path);
  const stat = statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(absolutePath)) {
      collectTextFiles(join(path, entry), files);
    }
    return;
  }

  if (['.ts', '.json', '.scene', '.prefab'].includes(extname(path))) {
    files.push(path);
  }
}
