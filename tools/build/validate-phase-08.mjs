import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.cwd();
const issues = [];

const requiredPaths = [
  'specs/SPEC_PHASE_08_V2_TASKS_EVENTS.md',
  'docs/design/phase-08-v2-tasks-events.md',
  'docs/playtest/phase-08-v2-playtest-plan.md',
  'tools/build/validate-phase-08.mjs',
  'package.json'
];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) {
    issues.push(`Missing Phase 08 path: ${path}`);
  }
}

const termChecks = [
  {
    path: 'docs/design/phase-08-v2-tasks-events.md',
    terms: [
      'Phase 08 V2 Tasks and Events Design Boundary',
      'not MVP scope',
      'default off',
      'phase08V2Enabled',
      'v2ObjectivesEnabled',
      'v2EventsEnabled',
      'objective',
      'ambient event',
      'Server Authority',
      'clients must never decide',
      'Forbidden',
      'scan',
      'sprint',
      'container hiding',
      'Mandatory task route',
      'Random capture',
      'Random scoring',
      'Core capture/survival score share',
      'Product Judgment Gate'
    ]
  },
  {
    path: 'docs/playtest/phase-08-v2-playtest-plan.md',
    terms: [
      'Phase 08 V2 Playtest Plan',
      '2 players',
      '3 players',
      '4 players',
      'v2ObjectivesEnabled',
      'v2EventsEnabled',
      'objectiveCompletionRate',
      'objectiveCausedCaptureRate',
      'eventInterferenceScore',
      'coreCaptureSurvivalScoreShare',
      'weakenedObservationMemory',
      'weakenedDisguiseReasoning',
      'weakenedLimitedAttackPressure',
      'mandatoryTaskRouteObserved',
      'randomCaptureObserved',
      'randomScoringObserved',
      'serverAuthorityConcern'
    ]
  },
  {
    path: 'package.json',
    terms: ['validate:phase08', 'tools/build/validate-phase-08.mjs']
  }
];

for (const check of termChecks) {
  const content = readIfExists(check.path);
  if (content == null) {
    continue;
  }

  for (const term of check.terms) {
    if (!content.includes(term)) {
      issues.push(`Missing Phase 08 term in ${check.path}: ${term}`);
    }
  }
}

const defaultOffChecks = [
  {
    path: 'docs/design/phase-08-v2-tasks-events.md',
    patterns: [
      /phase08V2Enabled`\s+default:\s+`false`/,
      /v2ObjectivesEnabled`\s+default:\s+`false`/,
      /v2EventsEnabled`\s+default:\s+`false`/,
      /default-off flag/,
      /MVP defaults must not spawn objective points/
    ]
  },
  {
    path: 'docs/playtest/phase-08-v2-playtest-plan.md',
    patterns: [
      /V2 flags are explicitly\s+enabled/,
      /MVP default rooms verified with V2 flags off/
    ]
  }
];

for (const check of defaultOffChecks) {
  const content = readIfExists(check.path);
  if (content == null) {
    continue;
  }

  for (const pattern of check.patterns) {
    if (!pattern.test(content)) {
      issues.push(`Missing Phase 08 default-off clue in ${check.path}: ${pattern}`);
    }
  }
}

const packageJson = readJsonIfExists('package.json');
if (packageJson && packageJson.scripts?.['validate:phase08'] !== 'node tools/build/validate-phase-08.mjs') {
  issues.push('package.json validate:phase08 must run node tools/build/validate-phase-08.mjs');
}

const serverGameConfig = readIfExists('server/src/game/ServerGameConfig.ts');
if (serverGameConfig != null) {
  if (!/\bv2ObjectivesEnabled:\s*false\b/.test(serverGameConfig)) {
    issues.push('server/src/game/ServerGameConfig.ts must keep v2ObjectivesEnabled: false');
  }

  if (!/\bv2EventsEnabled:\s*false\b/.test(serverGameConfig)) {
    issues.push('server/src/game/ServerGameConfig.ts must keep v2EventsEnabled: false');
  }

  if (/\bv2TasksEnabled\b|\bv2RandomEventsEnabled\b/.test(serverGameConfig)) {
    issues.push('server/src/game/ServerGameConfig.ts must not use legacy V2 task/random event flags');
  }
}

const protocolMessages = readIfExists('shared/src/protocol/messages.ts');
if (protocolMessages != null) {
  const unknownV2Collections = [
    /\bv2Objectives\??:\s*unknown\[\]/,
    /\bv2Events\??:\s*unknown\[\]/
  ];

  for (const pattern of unknownV2Collections) {
    if (pattern.test(protocolMessages)) {
      issues.push(`shared/src/protocol/messages.ts must not use unknown[] for V2 protocol collections: ${pattern}`);
    }
  }

  if (!/\bv2Objectives\??:\s*PublicV2ObjectiveState\[\]/.test(protocolMessages)) {
    issues.push('shared/src/protocol/messages.ts must type v2Objectives as PublicV2ObjectiveState[]');
  }

  if (!/\bv2Events\??:\s*PublicV2AmbientEventState\[\]/.test(protocolMessages)) {
    issues.push('shared/src/protocol/messages.ts must type v2Events as PublicV2AmbientEventState[]');
  }
}

const forbiddenImplementationPatterns = [
  ['seeker scan implementation', /\b(Seeker)?Scan(Ability|Controller|System|Service)\b|\bscanner(Ability|Controller|System)?\b|\bradar(Ability|Controller|System)?\b|\breveal(Ability|Controller|System|Hiders?)\b|\bxray\b/i],
  ['sprint or dash implementation', /\b(Sprint|Dash|SpeedBoost|Charge)(Ability|Controller|System|Service|Config)?\b|\baction:\s*['"](?:sprint|dash|speed_boost|charge)['"]/i],
  ['hider roll or combat implementation', /\b(HiderRoll|HiderAttack|HiderStun|Roll|Stun)(Ability|Controller|System|Service|Config)\b|\baction:\s*['"](?:roll|hider_attack|stun)['"]/i],
  ['container hiding implementation', /\b(Container|Cabinet|Locker|Closet|Cupboard|Crate)(Hiding|Hide|Entry|Interaction)(Controller|System|Service|Config)?\b|\baction:\s*['"](?:enter_container|enter_cabinet|enter_locker|hide_inside)['"]/i],
  ['task implementation in active source', /\b(HiderTask|TaskPoint|TaskReward|TaskProgress|TaskObjective|SideTask)(Controller|System|Service|Config|State)?\b|\baction:\s*['"](?:start_task|complete_task|interact_task)['"]/i],
  ['random event implementation in active source', /\b(RandomMapEvent|RandomEvent|EventReward|EventCapture|EventScore)(Controller|System|Service|Config|State)?\b|\baction:\s*['"](?:trigger_event|event_reward|event_capture)['"]/i],
  ['random capture or scoring implementation', /\b(randomCapture|randomReveal|randomScore|eventScore|eventCapture)\b/i],
  ['paid/ranked progression implementation', /\b(PaidSkin|PremiumSkin|SkinShop|Monetization|SeasonPass|RankedQueue|RankProgression)(Controller|System|Service|Config)?\b/i],
  ['p2p networking implementation', /\b(P2P|PeerToPeer|PeerConnection)(Room|Network|Transport|Service|Config)?\b/i]
];

const forbiddenScanRoots = [
  'client/assets/scripts',
  'client/assets/resources/configs',
  'server/src',
  'shared/src'
];

for (const path of listTextFiles(forbiddenScanRoots)) {
  const content = read(path);
  for (const [label, pattern] of forbiddenImplementationPatterns) {
    if (pattern.test(content)) {
      issues.push(`Forbidden Phase 08/MVP implementation term (${label}) in ${path}: ${pattern}`);
    }
  }
}

if (issues.length > 0) {
  console.error('Phase 08 validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Phase 08 validation passed.');

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
