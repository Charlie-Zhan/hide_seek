export interface PropConfig {
  id: string;
  spritePath: string;
  category: string;
  isDisguiseCandidate: boolean;
  isBreakable: boolean;
  isOccluder: boolean;
  collisionRadius?: number;
  visualRadius?: number;
}

export interface DisguisePropConfig {
  id: string;
  displayName: string;
  spritePath: string;
  radius: number;
  category: 'box' | 'plant' | 'bucket' | 'chair' | 'food' | 'misc';
}

export interface DisguisePropsConfig {
  props: DisguisePropConfig[];
}
