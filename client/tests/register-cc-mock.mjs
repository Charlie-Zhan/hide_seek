import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ccModuleDir = join(import.meta.dirname, '..', 'node_modules', 'cc');

mkdirSync(ccModuleDir, { recursive: true });
writeFileSync(
  join(ccModuleDir, 'package.json'),
  JSON.stringify({ name: 'cc', version: '0.0.0-test', type: 'module', main: './index.js' }, null, 2)
);
writeFileSync(
  join(ccModuleDir, 'index.js'),
  `export class Component {}
export class JsonAsset { constructor(json = null) { this.json = json; } }
export const _decorator = {
  ccclass() { return function ccclassDecorator(value) { return value; }; },
  property() { return function propertyDecorator() {}; }
};
export const director = { loadScene(_sceneName, done) { done?.(null); } };
export const resources = { load(_path, _type, done) { done?.(new Error('cc mock resources.load has no assets'), null); } };
`
);
