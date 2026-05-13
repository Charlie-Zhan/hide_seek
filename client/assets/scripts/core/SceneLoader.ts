import { director } from 'cc';
import { appEventBus } from './EventBus';
import { Logger } from './Logger';
import type { SceneName } from './GameConstants';

export class SceneLoader {
  private readonly logger = new Logger('SceneLoader');

  public load(sceneName: SceneName): void {
    appEventBus.emit('scene_load_requested', { sceneName });
    this.logger.info('Loading scene.', { sceneName });

    director.loadScene(sceneName, (error?: Error | null) => {
      if (error) {
        this.logger.error('Scene load failed.', { sceneName, error: error.message });
        return;
      }

      this.logger.info('Scene loaded.', { sceneName });
    });
  }
}
