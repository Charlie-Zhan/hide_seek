import { _decorator, Component } from 'cc';
import { InputController, type MoveVector, normalizeMove } from './InputController';

const { ccclass } = _decorator;

@ccclass('VirtualJoystick')
export class VirtualJoystick extends Component {
  private readonly move: MoveVector = { x: 0, y: 0 };
  private inputController: InputController | null = null;

  public bindInputController(inputController: InputController | null): void {
    this.inputController = inputController;
    this.flushMove();
  }

  public setMove(x: number, y: number): void {
    const normalized = normalizeMove(x, y);
    this.move.x = normalized.x;
    this.move.y = normalized.y;
    this.flushMove();
  }

  public release(): void {
    this.move.x = 0;
    this.move.y = 0;
    this.flushMove();
  }

  public getMove(): MoveVector {
    return { x: this.move.x, y: this.move.y };
  }

  private flushMove(): void {
    this.inputController?.setMove(this.move.x, this.move.y);
  }
}
