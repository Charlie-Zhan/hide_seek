export const SceneName = {
  Boot: 'Boot',
  Lobby: 'Lobby',
  Room: 'Room',
  Game: 'Game',
  Result: 'Result'
} as const;

export type SceneName = (typeof SceneName)[keyof typeof SceneName];

export const ResourcePath = {
  GameConfig: 'configs/game_config',
  KitchenMap: 'configs/map_kitchen_01',
  DisguiseProps: 'configs/disguise_props'
} as const;

export const GameConstants = {
  projectName: 'Prop Hide & Seek',
  cocosVersionMajor: 3,
  defaultBootTarget: SceneName.Lobby
} as const;
