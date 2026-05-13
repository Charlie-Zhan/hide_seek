import { _decorator, Component } from 'cc';
import { InputController } from './InputController';

const { ccclass } = _decorator;

@ccclass('ActionButton')
export class ActionButton extends Component {
  private inputController: InputController | null = null;
  private pressedCount = 0;

  public bindInputController(inputController: InputController | null): void {
    this.inputController = inputController;
  }

  public press(): void {
    this.pressedCount += 1;
    this.inputController?.pressAction();
  }

  public getPressedCount(): number {
    return this.pressedCount;
  }

  public resetPressedCount(): void {
    this.pressedCount = 0;
  }
}
