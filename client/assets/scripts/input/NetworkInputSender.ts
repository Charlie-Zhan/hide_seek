import { _decorator, Component } from 'cc';
import type { PlayerInputAction, PlayerInputMessage } from '@prop-hide-seek/shared';
import type { NetworkClient } from '../network/NetworkClient';
import { roomNetworkClient } from '../network/NetworkClient';
import { InputController, type InputSnapshot } from './InputController';

const { ccclass } = _decorator;

export type InputActionResolver = (snapshot: InputSnapshot) => PlayerInputAction | null | undefined;

const DEFAULT_INPUT_RATE_HZ = 15;

@ccclass('NetworkInputSender')
export class NetworkInputSender extends Component {
  private inputController: InputController | null = null;
  private networkClient: NetworkClient = roomNetworkClient;
  private actionResolver: InputActionResolver | null = null;
  private nextSeq = 1;
  private sendIntervalSeconds = 1 / DEFAULT_INPUT_RATE_HZ;
  private elapsedSinceSendSeconds = 0;
  private enabledSending = true;

  public bindInputController(inputController: InputController | null): void {
    this.inputController = inputController;
  }

  public bindNetworkClient(networkClient: NetworkClient): void {
    this.networkClient = networkClient;
  }

  public setActionResolver(actionResolver: InputActionResolver | null): void {
    this.actionResolver = actionResolver;
  }

  public setInputRateHz(rateHz: number): void {
    const safeRateHz = Number.isFinite(rateHz) ? rateHz : DEFAULT_INPUT_RATE_HZ;
    this.sendIntervalSeconds = 1 / Math.max(1, safeRateHz);
  }

  public setSendingEnabled(enabled: boolean): void {
    this.enabledSending = enabled;
  }

  public resetSequence(nextSeq = 1): void {
    this.nextSeq = Math.max(1, Math.floor(nextSeq));
  }

  public update(deltaSeconds: number): void {
    if (!this.enabledSending) {
      return;
    }

    this.elapsedSinceSendSeconds += Math.max(0, deltaSeconds);
    if (this.elapsedSinceSendSeconds < this.sendIntervalSeconds) {
      return;
    }

    this.elapsedSinceSendSeconds = 0;
    this.sendCurrentInput();
  }

  public sendCurrentInput(actionIntent?: PlayerInputAction | null): boolean {
    if (!this.inputController) {
      return false;
    }

    const snapshot = this.inputController.getSnapshot();
    const action = this.resolveAction(snapshot, actionIntent);
    const message: PlayerInputMessage = {
      type: 'player_input',
      seq: this.nextSeq,
      moveX: snapshot.move.x,
      moveY: snapshot.move.y,
      clientTimeMs: Date.now()
    };

    this.nextSeq += 1;

    if (action) {
      message.action = action;
      this.inputController.consumeAction();
    }

    return this.networkClient.send(message);
  }

  private resolveAction(
    snapshot: InputSnapshot,
    actionIntent?: PlayerInputAction | null
  ): PlayerInputAction | undefined {
    if (actionIntent !== undefined) {
      return normalizeAction(actionIntent);
    }

    if (!snapshot.actionQueued || !this.actionResolver) {
      return undefined;
    }

    return normalizeAction(this.actionResolver(snapshot));
  }
}

function normalizeAction(action: PlayerInputAction | null | undefined): PlayerInputAction | undefined {
  return action === 'attack' || action === 'switch_prop' ? action : undefined;
}
