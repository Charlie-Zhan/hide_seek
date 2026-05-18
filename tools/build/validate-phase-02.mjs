import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'client/assets/resources/configs/map_kitchen_01.json',
  'client/assets/resources/configs/disguise_props.json',
  'client/assets/art/kenney/atlas_gameplay_props.json',
  'client/assets/art/kenney/licenses/README.md',
  'client/assets/scripts/map/MapManager.ts',
  'client/assets/scripts/map/PropInstance.ts',
  'client/assets/scripts/gameplay/LocalGameMapAdapter.ts',
  'client/tests/map-disguise-pipeline.test.ts',
  'docs/decisions/phase-02-map-disguise-pipeline.md'
];

const missing = requiredPaths.filter((path) => !existsSync(join(root, path)));
if (missing.length > 0) {
  fail('Missing Phase 02 paths:', missing);
}

const mapConfig = readJson('client/assets/resources/configs/map_kitchen_01.json');
const disguiseConfig = readJson('client/assets/resources/configs/disguise_props.json');

const mapId = mapConfig.mapId ?? mapConfig.id;
if (mapId !== 'kitchen_01') {
  fail('Expected map id kitchen_01.', [`mapId=${mapId}`]);
}

const width = mapConfig.width ?? mapConfig.size?.width;
const height = mapConfig.height ?? mapConfig.size?.height;
if (width !== 1440 || height !== 810) {
  fail('Expected single-screen kitchen map size 1440x810.', [`width=${width}`, `height=${height}`]);
}

const props = mapConfig.props ?? mapConfig.propInstances ?? [];
const breakableProps = props.filter((prop) => prop.isBreakable ?? prop.breakable ?? true);
if (breakableProps.length < 30 || breakableProps.length > 40) {
  fail('Expected 30-40 breakable props for the single-screen kitchen.', [`count=${breakableProps.length}`]);
}

const obstacles = mapConfig.obstacles ?? [];
if (obstacles.length < 6 || obstacles.length > 10) {
  fail('Expected 6-10 obstacles for the small kitchen.', [`count=${obstacles.length}`]);
}

const occluders = mapConfig.occluders ?? [];
if (occluders.length < 5 || occluders.length > 8) {
  fail('Expected 5-8 occluders for the small kitchen.', [`count=${occluders.length}`]);
}

const spawnPoints = mapConfig.spawnPoints ?? [];
if (spawnPoints.length < 4) {
  fail('Expected at least 4 spawn/test positions.', [`count=${spawnPoints.length}`]);
}

if (!mapConfig.seekerSpawnPoint) {
  fail('Expected seekerSpawnPoint.', []);
}

const landmarks = mapConfig.landmarks ?? [];
if (landmarks.length < 3) {
  fail('Expected at least 3 landmarks.', [`count=${landmarks.length}`]);
}

const expectedDisguises = ['wooden_crate', 'trash_bin', 'plant_pot', 'chair', 'water_bucket', 'food_basket'];
const mapPool = mapConfig.disguiseProps ?? mapConfig.disguisePropIds ?? [];
const missingDisguises = expectedDisguises.filter((id) => !mapPool.includes(id));
if (mapPool.length !== expectedDisguises.length || missingDisguises.length > 0) {
  fail('Expected exact MVP disguise pool.', [`pool=${JSON.stringify(mapPool)}`, `missing=${missingDisguises.join(',')}`]);
}

const propConfigs = disguiseConfig.props ?? [];
const propIds = new Set(propConfigs.map((prop) => prop.id));
const missingPropConfigs = expectedDisguises.filter((id) => !propIds.has(id));
if (missingPropConfigs.length > 0) {
  fail('Missing disguise prop config records.', missingPropConfigs);
}

for (const prop of propConfigs.filter((prop) => expectedDisguises.includes(prop.id))) {
  const missingFields = ['id', 'displayName', 'spritePath', 'category', 'radius'].filter((field) => prop[field] === undefined);
  if (missingFields.length > 0) {
    fail(`Prop ${prop.id} missing required fields.`, missingFields);
  }
}

console.log('Phase 02 validation passed.');

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function fail(title, details) {
  console.error(`Phase 02 validation failed. ${title}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exit(1);
}
