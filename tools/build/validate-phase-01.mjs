import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'client/assets/scripts/gameplay/LocalGameEngine.ts',
  'client/assets/scripts/gameplay/LocalGameTypes.ts',
  'client/assets/scripts/gameplay/RoundManager.ts',
  'client/assets/scripts/gameplay/ScoreManager.ts',
  'client/assets/scripts/gameplay/DisguiseController.ts',
  'client/assets/scripts/gameplay/SeekerAttackController.ts',
  'client/assets/scripts/util/Geometry2D.ts',
  'client/assets/scripts/input/InputController.ts',
  'client/assets/scripts/input/VirtualJoystick.ts',
  'client/assets/scripts/input/ActionButton.ts',
  'client/assets/scripts/ui/GameHUD.ts',
  'client/assets/scripts/ui/PreviewOverlay.ts',
  'client/assets/scripts/ui/SeekerBlindOverlay.ts',
  'client/assets/scripts/ui/ResultPanel.ts',
  'client/assets/scripts/map/MapManager.ts',
  'client/assets/scripts/map/PropInstance.ts',
  'client/assets/scripts/core/TimeUtil.ts',
  'client/tests/local-gameplay.test.ts'
];

const forbiddenPatterns = [
  /\bscan(skill)?\b/i,
  /\bsprint\b/i,
  /\bdash\b/i,
  /\broll\b/i,
  /\bcontainer hiding\b/i,
  /\brandom event\b/i,
  /\bside task\b/i,
  /\bpeer-to-peer\b/i,
  /\bp2p\b/i
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));

if (missing.length > 0) {
  console.error('Phase 01 validation failed. Missing paths:');
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const filesToScan = requiredPaths.filter((path) => path.endsWith('.ts'));
const forbiddenHits = [];

for (const path of filesToScan) {
  const content = readFileSync(join(root, path), 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      forbiddenHits.push(`${path}: ${pattern}`);
    }
  }
}

if (forbiddenHits.length > 0) {
  console.error('Phase 01 validation failed. Forbidden later-phase terms found:');
  for (const hit of forbiddenHits) {
    console.error(`- ${hit}`);
  }
  process.exit(1);
}

console.log('Phase 01 validation passed.');
