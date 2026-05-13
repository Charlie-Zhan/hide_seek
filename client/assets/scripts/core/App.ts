import { _decorator, Component, JsonAsset, resources } from 'cc';
import type { GameConfig } from '@prop-hide-seek/shared';
import { appEventBus } from './EventBus';
import { GameConstants, ResourcePath } from './GameConstants';
import { Logger } from './Logger';
import { SceneLoader } from './SceneLoader';

const { ccclass } = _decorator;

@ccclass('App')
export class App extends Component {
  private readonly logger = new Logger('App');
  private readonly sceneLoader = new SceneLoader();
  private gameConfig: GameConfig | null = null;

  protected override start(): void {
    this.logger.info('Bootstrapping client foundation.', {
      projectName: GameConstants.projectName
    });

    this.loadGameConfig();
  }

  public getLoadedGameConfig(): GameConfig | null {
    return this.gameConfig;
  }

  private loadGameConfig(): void {
    resources.load(ResourcePath.GameConfig, JsonAsset, (error, asset) => {
      if (error || !asset) {
        this.logger.error('Failed to load game_config.json.', {
          error: error?.message ?? 'Missing JsonAsset'
        });
        return;
      }

      this.gameConfig = asset.json as GameConfig;
      this.logger.info('Loaded game_config.json.', this.gameConfig);
      appEventBus.emit('game_config_loaded', this.gameConfig);
      this.sceneLoader.load(GameConstants.defaultBootTarget);
    });
  }
}
