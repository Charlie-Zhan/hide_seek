import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

export interface PropPosition {
  x: number;
  y: number;
}

export interface PropInstanceState {
  instanceId: string;
  configId: string;
  propId: string;
  position: PropPosition;
  layer: string;
  radius: number;
  destroyed: boolean;
  isBreakable: boolean;
  isDisguiseCandidate: boolean;
  breakable?: boolean;
}

@ccclass('PropInstance')
export class PropInstance extends Component {
  private state: PropInstanceState = {
    instanceId: '',
    configId: '',
    propId: '',
    position: { x: 0, y: 0 },
    layer: 'object_back',
    radius: 16,
    destroyed: false,
    isBreakable: true,
    isDisguiseCandidate: false,
    breakable: true
  };

  public configure(state: PropInstanceState): void {
    this.state = normalizeState(state);
  }

  public getState(): PropInstanceState {
    return cloneState(this.state);
  }

  public getInstanceId(): string {
    return this.state.instanceId;
  }

  public getPropId(): string {
    return this.state.propId;
  }

  public getConfigId(): string {
    return this.state.configId;
  }

  public getPosition(): PropPosition {
    return { ...this.state.position };
  }

  public getLayer(): string {
    return this.state.layer;
  }

  public getRadius(): number {
    return this.state.radius;
  }

  public isDestroyed(): boolean {
    return this.state.destroyed;
  }

  public isBreakable(): boolean {
    return this.state.isBreakable;
  }

  public isDisguiseCandidate(): boolean {
    return this.state.isDisguiseCandidate;
  }

  public markDestroyed(): boolean {
    if (this.state.destroyed || !this.state.isBreakable) {
      return false;
    }

    this.state.destroyed = true;
    return true;
  }

  public resetDestroyed(): void {
    this.state.destroyed = false;
  }
}

function normalizeState(state: PropInstanceState): PropInstanceState {
  const isBreakable = state.isBreakable ?? state.breakable ?? true;
  const configId = state.configId || state.propId;
  const propId = state.propId || configId;

  return cloneState({
    ...state,
    configId,
    propId,
    isBreakable,
    breakable: isBreakable,
    radius: state.radius,
    isDisguiseCandidate: state.isDisguiseCandidate
  });
}

function cloneState(state: PropInstanceState): PropInstanceState {
  const isBreakable = state.isBreakable ?? state.breakable ?? true;
  return {
    ...state,
    configId: state.configId || state.propId,
    propId: state.propId || state.configId,
    radius: state.radius,
    isBreakable,
    breakable: isBreakable,
    isDisguiseCandidate: state.isDisguiseCandidate,
    position: { ...state.position }
  };
}
