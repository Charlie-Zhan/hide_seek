import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

export interface MoveVector {
  x: number;
  y: number;
}

export interface InputSnapshot {
  move: MoveVector;
  actionQueued: boolean;
}

@ccclass('InputController')
export class InputController extends Component {
  private readonly move: MoveVector = { x: 0, y: 0 };
  private actionQueued = false;

  public setMove(x: number, y: number): void {
    const normalized = normalizeMove(x, y);
    this.move.x = normalized.x;
    this.move.y = normalized.y;
  }

  public clearMove(): void {
    this.move.x = 0;
    this.move.y = 0;
  }

  public getMove(): MoveVector {
    return { x: this.move.x, y: this.move.y };
  }

  public pressAction(): void {
    this.actionQueued = true;
  }

  public consumeAction(): boolean {
    const wasQueued = this.actionQueued;
    this.actionQueued = false;
    return wasQueued;
  }

  public hasActionQueued(): boolean {
    return this.actionQueued;
  }

  public getSnapshot(): InputSnapshot {
    return {
      move: this.getMove(),
      actionQueued: this.actionQueued
    };
  }

  public reset(): void {
    this.clearMove();
    this.actionQueued = false;
  }
}

export function normalizeMove(x: number, y: number): MoveVector {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const length = Math.hypot(safeX, safeY);

  if (length <= 0) {
    return { x: 0, y: 0 };
  }

  if (length <= 1) {
    return { x: safeX, y: safeY };
  }

  return {
    x: safeX / length,
    y: safeY / length
  };
}
