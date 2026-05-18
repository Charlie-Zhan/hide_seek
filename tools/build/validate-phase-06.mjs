import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const root = process.cwd();
const issues = [];

const requiredPaths = [
  'client/assets/scripts/ui/LobbyUI.ts',
  'client/assets/scripts/ui/RoomUI.ts',
  'client/assets/scripts/ui/GameHUD.ts',
  'client/assets/scripts/ui/PreviewOverlay.ts',
  'client/assets/scripts/ui/SeekerBlindOverlay.ts',
  'client/assets/scripts/ui/ResultPanel.ts',
  'client/assets/scripts/effects/FeedbackEvents.ts',
  'client/assets/scripts/effects/FeedbackEffectRouter.ts',
  'client/assets/scripts/audio/AudioCueCatalog.ts',
  'client/assets/scripts/audio/FeedbackAudioRouter.ts',
  'client/assets/audio/README.md',
  'docs/playtest/phase-06-ui-ux-audio-polish.md'
];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) {
    issues.push(`Missing Phase 06 path: ${path}`);
  }
}

const termChecks = [
  {
    path: 'docs/playtest/phase-06-ui-ux-audio-polish.md',
    terms: [
      'Phase 06 UI/UX/Audio Polish Checklist',
      'Lobby UI',
      'Room UI',
      'Game HUD',
      'Preview',
      'Hide',
      'Seek',
      'Result panel',
      'Audio cues',
      'Forbidden MVP',
      'npm run validate:phase06'
    ]
  },
  {
    path: 'client/assets/scripts/ui/LobbyUI.ts',
    terms: ['Prop Hide & Seek', 'Create Room', 'Join Room', 'How to Play', 'playerName']
  },
  {
    path: 'client/assets/scripts/ui/RoomUI.ts',
    terms: [
      'roomCodeText',
      'playerList',
      'readyButtonText',
      'shareButtonText',
      'startButtonText',
      'backButtonText',
      'connectionStatusText'
    ]
  },
  {
    path: 'client/assets/scripts/ui/GameHUD.ts',
    terms: [
      'phaseText',
      'countdownText',
      'remainingAttacks',
      'capturedText',
      'scoresText',
      'Final 5 Seconds'
    ]
  },
  {
    path: 'client/assets/scripts/ui/PreviewOverlay.ts',
    terms: ['Observe the map', 'prop positions']
  },
  {
    path: 'client/assets/scripts/ui/SeekerBlindOverlay.ts',
    terms: ['Hiders are arranging the scene', 'countdown']
  },
  {
    path: 'client/assets/scripts/ui/ResultPanel.ts',
    terms: ['capturedCount', 'scoreDeltas', 'totalScore', 'ranking', 'nextSeeker']
  },
  {
    path: 'client/assets/scripts/effects/FeedbackEvents.ts',
    terms: ['AttackFeedbackOutcome', 'HiderHit', 'PropHit', 'Miss', 'AttacksDepleted']
  },
  {
    path: 'client/assets/scripts/effects/FeedbackEffectRouter.ts',
    terms: [
      'AttackSectorSweep',
      'AttackPropImpact',
      'AttackCaptureImpact',
      'AttackMissRipple',
      'AttacksDepletedNotice',
      'DisguiseIconSwap'
    ]
  },
  {
    path: 'client/assets/scripts/audio/AudioCueCatalog.ts',
    terms: [
      'sfx_button_click',
      'sfx_countdown_tick',
      'sfx_disguise_switch',
      'sfx_attack_swing',
      'sfx_prop_break',
      'sfx_capture',
      'sfx_round_start',
      'sfx_round_end',
      'sfx_victory',
      'sfx_defeat'
    ]
  },
  {
    path: 'client/assets/scripts/audio/FeedbackAudioRouter.ts',
    terms: [
      'ButtonClick',
      'CountdownTick',
      'DisguiseSwitch',
      'AttackSwing',
      'PropBreak',
      'Capture',
      'RoundStart',
      'RoundEnd',
      'Victory',
      'Defeat'
    ]
  },
  {
    path: 'client/assets/audio/README.md',
    terms: [
      'button_click',
      'countdown_tick',
      'disguise_switch',
      'attack_swing',
      'prop_break',
      'capture',
      'round_start',
      'round_end',
      'victory',
      'defeat'
    ]
  }
];

for (const check of termChecks) {
  const content = readIfExists(check.path);
  if (content == null) {
    continue;
  }

  for (const term of check.terms) {
    if (!content.includes(term)) {
      issues.push(`Missing Phase 06 term in ${check.path}: ${term}`);
    }
  }
}

const forbiddenPatterns = [
  ['seeker scan', /\bscan(ner|ning)?\b|\u626b\u63cf|\u626b\u7784/i],
  ['sprint or dash', /\bsprint(ing)?\b|\bdash(ing)?\b|\u51b2\u523a|\u75be\u8dd1/i],
  ['hider roll', /\broll(ing)?\b|\u7ffb\u6eda/i],
  [
    'container hiding',
    /container\s*hiding|hide\s*in\s*(container|cabinet|locker|closet|cupboard)|enter\s*(crate|cabinet|locker|closet|cupboard)|\u8fdb\u5165.*(\u67dc|\u7bb1|\u5bb9\u5668)|\u8eb2\u8fdb|\u5bb9\u5668\u8eb2\u85cf|\u67dc\u5b50\u8eb2\u85cf/i
  ],
  ['hider task', /\bquest(s)?\b|\bside\s*task(s)?\b|\u8eb2\u85cf\u8005.*\u4efb\u52a1|\u5c0f\u4efb\u52a1/i],
  ['random map event', /random\s*event|\u968f\u673a.*\u4e8b\u4ef6/i],
  ['paid skin', /paid\s*skin|premium\s*skin|skin\s*shop|cosmetic\s*skin|\u4ed8\u8d39.*\u76ae\u80a4|\u76ae\u80a4.*\u4ed8\u8d39|\u6c2a\u91d1|\u5546\u57ce/i],
  ['season or ranked progression', /\bseason(s)?\b|\branked\b|\brank\s*progression\b|\u8d5b\u5b63|\u6392\u4f4d/i],
  ['p2p networking', /\bp2p\b|peer[-\s]*to[-\s]*peer/i]
];

const forbiddenScanRoots = [
  'client/assets/scripts/ui',
  'client/assets/scripts/effects',
  'client/assets/scripts/audio',
  'client/assets/resources/configs'
];

for (const path of listTextFiles(forbiddenScanRoots)) {
  const content = read(path);
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(content)) {
      issues.push(`Forbidden MVP feature term (${label}) in ${path}: ${pattern}`);
    }
  }
}

if (issues.length > 0) {
  console.error('Phase 06 validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Phase 06 validation passed.');

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
