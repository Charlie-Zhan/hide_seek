declare module 'cc' {
  export class Node {
    active: boolean;
    constructor(name?: string);
    addChild(child: Node): void;
    addComponent<T>(type: new (...args: never[]) => T): T;
    getChildByName(name: string): Node | null;
    getComponent<T>(type: new (...args: never[]) => T): T | null;
    removeAllChildren(): void;
    setPosition(position: Vec3): void;
    destroy(): void;
    on(eventType: string, callback: () => void): void;
  }

  export class Component {
    node: Node;
    protected onLoad?(): void;
    protected start?(): void;
  }

  export class Director {
    static EVENT_AFTER_SCENE_LAUNCH: string;
  }

  export class Vec3 {
    constructor(x?: number, y?: number, z?: number);
  }

  export class Size {
    constructor(width?: number, height?: number);
  }

  export class Color {
    constructor(r?: number, g?: number, b?: number, a?: number);
  }

  export class UITransform extends Component {
    setContentSize(size: Size): void;
  }

  export class Sprite extends Component {
    color: Color;
  }

  export class Graphics extends Component {
    fillColor: Color;
    clear(): void;
    rect(x: number, y: number, width: number, height: number): void;
    circle(x: number, y: number, radius: number): void;
    fill(): void;
  }

  export class Label extends Component {
    string: string;
    fontSize: number;
    lineHeight: number;
    color: Color;
    horizontalAlign: number;
    verticalAlign: number;
    static HorizontalAlign: {
      CENTER: number;
    };
    static VerticalAlign: {
      CENTER: number;
    };
  }

  export class EditBox extends Component {
    placeholder: string;
    string: string;
    fontSize: number;
    placeholderFontSize: number;
    fontColor: Color;
    placeholderFontColor: Color;
  }

  export class Button extends Component {
    transition: number;
    normalColor: Color;
    pressedColor: Color;
    hoverColor: Color;
    static Transition: {
      COLOR: number;
    };
    static EventType: {
      CLICK: string;
    };
  }

  export class JsonAsset {
    json: unknown;
  }

  export const _decorator: {
    ccclass(name: string): ClassDecorator;
    property(...args: unknown[]): PropertyDecorator;
  };

  export const director: {
    on(eventType: string, callback: () => void): void;
    getScene(): Node | null;
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
