import { _decorator, Component } from 'cc';
import { formatCountdown } from '../core/TimeUtil';

const { ccclass } = _decorator;

export interface SeekerBlindOverlayDisplayState {
  visible: boolean;
  messageText: string;
  countdownText: string;
  countdownWarning: boolean;
  mapVisible: boolean;
  controlsEnabled: boolean;
}

@ccclass('SeekerBlindOverlay')
export class SeekerBlindOverlay extends Component {
  private visible = false;
  private message = 'Hiders are arranging the scene';
  private countdownMs = 0;

  public show(message = 'Hiders are arranging the scene', countdownMs = this.countdownMs): void {
    this.visible = true;
    this.message = message;
    this.countdownMs = normalizeCountdownMs(countdownMs);
  }

  public hide(): void {
    this.visible = false;
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setCountdownMs(countdownMs: number): void {
    this.countdownMs = normalizeCountdownMs(countdownMs);
  }

  public getMessage(): string {
    return this.message;
  }

  public getDisplayState(): SeekerBlindOverlayDisplayState {
    return {
      visible: this.visible,
      messageText: this.message,
      countdownText: formatCountdown(this.countdownMs),
      countdownWarning: this.countdownMs > 0 && this.countdownMs <= 5000,
      mapVisible: false,
      controlsEnabled: false
    };
  }
}

function normalizeCountdownMs(countdownMs: number): number {
  if (!Number.isFinite(countdownMs)) {
    return 0;
  }

  return Math.max(0, Math.round(countdownMs));
}
