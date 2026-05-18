import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'client/assets/scenes/Boot.scene',
  'client/assets/scenes/Lobby.scene',
  'client/assets/scenes/Room.scene',
  'client/assets/scenes/Game.scene',
  'client/assets/scenes/Result.scene',
  'client/assets/scripts/core/App.ts',
  'client/assets/scripts/core/GameConstants.ts',
  'client/assets/scripts/core/EventBus.ts',
  'client/assets/scripts/core/Logger.ts',
  'client/assets/scripts/core/SceneLoader.ts',
  'client/assets/resources/configs/game_config.json',
  'client/assets/resources/configs/map_kitchen_01.json',
  'client/assets/resources/configs/disguise_props.json',
  'client/assets/art/kenney/licenses',
  'client/assets/audio/sfx',
  'client/assets/audio/music',
  'server/src/index.ts',
  'shared/src/index.ts'
];

const requiredConfigFields = [
  'previewDurationMs',
  'hideDurationMs',
  'seekDurationMs',
  'resultDurationMs',
  'attackSectorDeg',
  'attackRadiusPx',
  'attackCountMultiplier',
  'hiderHideSpeed',
  'hiderSeekSpeed',
  'seekerSpeed'
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));

if (missing.length > 0) {
  console.error('Phase 00 validation failed. Missing paths:');
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

const gameConfigPath = join(root, 'client/assets/resources/configs/game_config.json');
const gameConfig = JSON.parse(readFileSync(gameConfigPath, 'utf8'));
const missingFields = requiredConfigFields.filter((field) => !(field in gameConfig));

if (missingFields.length > 0) {
  console.error('Phase 00 validation failed. Missing game_config.json fields:');
  for (const field of missingFields) {
    console.error(`- ${field}`);
  }
  process.exit(1);
}

console.log('Phase 00 validation passed.');
