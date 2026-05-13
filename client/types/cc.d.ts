declare module 'cc' {
  export class Component {
    protected onLoad?(): void;
    protected start?(): void;
  }

  export class JsonAsset {
    json: unknown;
  }

  export const _decorator: {
    ccclass(name: string): ClassDecorator;
    property(...args: unknown[]): PropertyDecorator;
  };

  export const director: {
    loadScene(sceneName: string, onLaunched?: (error?: Error | null) => void): void;
  };

  export const resources: {
    load<T>(
      path: string,
      type: new (...args: never[]) => T,
      onComplete: (error: Error | null, asset: T | null) => void
    ): void;
  };
}
