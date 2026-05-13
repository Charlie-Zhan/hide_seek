import type { MoveVector } from './InputController';
import { normalizeMove } from './InputController';

export type TouchId = number | string;

export interface TouchPoint {
  id: TouchId;
  x: number;
  y: number;
}

export interface TouchInputSink {
  setMove(x: number, y: number): void;
  clearMove(): void;
  pressAction(): void;
}

export interface ScreenSafeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
}

export interface ControlCircle {
  centerX: number;
  centerY: number;
  radius: number;
  touchRadius: number;
}

export interface LandscapeControlLayout {
  screenWidth: number;
  screenHeight: number;
  safeInsets: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  joystick: ControlCircle;
  actionButton: ControlCircle;
}

export interface LandscapeSafeAreaOptions {
  screenWidth: number;
  screenHeight: number;
  safeArea?: ScreenSafeArea | null;
  joystickRadius?: number;
  actionButtonRadius?: number;
  edgePadding?: number;
  bottomPadding?: number;
  touchPadding?: number;
}

export interface TouchInputAdapterOptions {
  layout: LandscapeControlLayout;
  sink?: TouchInputSink | null;
  joystickDeadZone?: number;
}

export interface TouchInputState {
  moveTouchId: TouchId | null;
  activeActionTouchIds: TouchId[];
  move: MoveVector;
}

const DEFAULT_JOYSTICK_RADIUS = 64;
const DEFAULT_ACTION_BUTTON_RADIUS = 52;
const DEFAULT_EDGE_PADDING = 24;
const DEFAULT_BOTTOM_PADDING = 22;
const DEFAULT_TOUCH_PADDING = 20;
const DEFAULT_JOYSTICK_DEAD_ZONE = 0.12;

export class TouchInputAdapter {
  private layout: LandscapeControlLayout;
  private sink: TouchInputSink | null;
  private joystickDeadZone: number;
  private moveTouchId: TouchId | null = null;
  private readonly actionTouchIds = new Set<TouchId>();
  private readonly move: MoveVector = { x: 0, y: 0 };

  public constructor(options: TouchInputAdapterOptions) {
    this.layout = options.layout;
    this.sink = options.sink ?? null;
    this.joystickDeadZone = normalizeDeadZone(options.joystickDeadZone);
  }

  public bindSink(sink: TouchInputSink | null): void {
    this.sink = sink;
    this.flushMove();
  }

  public setLayout(layout: LandscapeControlLayout): void {
    this.layout = layout;
  }

  public setJoystickDeadZone(deadZone: number): void {
    this.joystickDeadZone = normalizeDeadZone(deadZone);
  }

  public handleTouchStart(point: TouchPoint): void {
    const safePoint = normalizeTouchPoint(point);

    if (this.isInsideCircle(safePoint, this.layout.actionButton)) {
      this.actionTouchIds.add(safePoint.id);
      this.sink?.pressAction();
      return;
    }

    if (this.moveTouchId === null && this.isInsideCircle(safePoint, this.layout.joystick)) {
      this.moveTouchId = safePoint.id;
      this.updateMoveFromTouch(safePoint);
    }
  }

  public handleTouchMove(point: TouchPoint): void {
    const safePoint = normalizeTouchPoint(point);

    if (safePoint.id === this.moveTouchId) {
      this.updateMoveFromTouch(safePoint);
    }
  }

  public handleTouchEnd(id: TouchId): void {
    if (id === this.moveTouchId) {
      this.moveTouchId = null;
      this.clearMove();
    }

    this.actionTouchIds.delete(id);
  }

  public handleTouchCancel(id: TouchId): void {
    this.handleTouchEnd(id);
  }

  public handleTouchStarts(points: readonly TouchPoint[]): void {
    for (const point of points) {
      this.handleTouchStart(point);
    }
  }

  public handleTouchMoves(points: readonly TouchPoint[]): void {
    for (const point of points) {
      this.handleTouchMove(point);
    }
  }

  public handleTouchEnds(ids: readonly TouchId[]): void {
    for (const id of ids) {
      this.handleTouchEnd(id);
    }
  }

  public cancelAll(): void {
    this.moveTouchId = null;
    this.actionTouchIds.clear();
    this.clearMove();
  }

  public getState(): TouchInputState {
    return {
      moveTouchId: this.moveTouchId,
      activeActionTouchIds: [...this.actionTouchIds],
      move: { x: this.move.x, y: this.move.y }
    };
  }

  private updateMoveFromTouch(point: TouchPoint): void {
    const maxDistance = Math.max(1, this.layout.joystick.radius);
    const rawX = (point.x - this.layout.joystick.centerX) / maxDistance;
    const rawY = (this.layout.joystick.centerY - point.y) / maxDistance;
    const normalized = normalizeMove(rawX, rawY);
    const magnitude = Math.hypot(normalized.x, normalized.y);

    if (magnitude < this.joystickDeadZone) {
      this.move.x = 0;
      this.move.y = 0;
    } else {
      this.move.x = normalized.x;
      this.move.y = normalized.y;
    }

    this.flushMove();
  }

  private clearMove(): void {
    this.move.x = 0;
    this.move.y = 0;
    this.sink?.clearMove();
  }

  private flushMove(): void {
    this.sink?.setMove(this.move.x, this.move.y);
  }

  private isInsideCircle(point: TouchPoint, circle: ControlCircle): boolean {
    const dx = point.x - circle.centerX;
    const dy = point.y - circle.centerY;
    return dx * dx + dy * dy <= circle.touchRadius * circle.touchRadius;
  }
}

export function createLandscapeControlLayout(
  options: LandscapeSafeAreaOptions
): LandscapeControlLayout {
  const screenWidth = Math.max(1, sanitizeNumber(options.screenWidth));
  const screenHeight = Math.max(1, sanitizeNumber(options.screenHeight));
  const joystickRadius = Math.max(1, sanitizeNumber(options.joystickRadius, DEFAULT_JOYSTICK_RADIUS));
  const actionButtonRadius = Math.max(
    1,
    sanitizeNumber(options.actionButtonRadius, DEFAULT_ACTION_BUTTON_RADIUS)
  );
  const edgePadding = Math.max(0, sanitizeNumber(options.edgePadding, DEFAULT_EDGE_PADDING));
  const bottomPadding = Math.max(0, sanitizeNumber(options.bottomPadding, DEFAULT_BOTTOM_PADDING));
  const touchPadding = Math.max(0, sanitizeNumber(options.touchPadding, DEFAULT_TOUCH_PADDING));
  const safeInsets = calculateLandscapeSafeInsets(screenWidth, screenHeight, options.safeArea);
  const controlBaselineY =
    screenHeight - safeInsets.bottom - bottomPadding - Math.max(joystickRadius, actionButtonRadius);

  return {
    screenWidth,
    screenHeight,
    safeInsets,
    joystick: {
      centerX: safeInsets.left + edgePadding + joystickRadius,
      centerY: controlBaselineY,
      radius: joystickRadius,
      touchRadius: joystickRadius + touchPadding
    },
    actionButton: {
      centerX: screenWidth - safeInsets.right - edgePadding - actionButtonRadius,
      centerY: controlBaselineY,
      radius: actionButtonRadius,
      touchRadius: actionButtonRadius + touchPadding
    }
  };
}

export function calculateLandscapeSafeInsets(
  screenWidth: number,
  screenHeight: number,
  safeArea?: ScreenSafeArea | null
): LandscapeControlLayout['safeInsets'] {
  const width = Math.max(1, sanitizeNumber(screenWidth));
  const height = Math.max(1, sanitizeNumber(screenHeight));

  if (!safeArea) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }

  const left = clamp(safeArea.left, 0, width);
  const top = clamp(safeArea.top, 0, height);
  const rightEdge = clamp(safeArea.right, left, width);
  const bottomEdge = clamp(safeArea.bottom, top, height);

  return {
    left,
    right: Math.max(0, width - rightEdge),
    top,
    bottom: Math.max(0, height - bottomEdge)
  };
}

function normalizeTouchPoint(point: TouchPoint): TouchPoint {
  return {
    id: point.id,
    x: sanitizeNumber(point.x),
    y: sanitizeNumber(point.y)
  };
}

function normalizeDeadZone(deadZone = DEFAULT_JOYSTICK_DEAD_ZONE): number {
  return clamp(deadZone, 0, 0.95);
}

function sanitizeNumber(value: number | undefined, fallback: number = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  const safeValue = sanitizeNumber(value, min);
  return Math.min(max, Math.max(min, safeValue));
}
