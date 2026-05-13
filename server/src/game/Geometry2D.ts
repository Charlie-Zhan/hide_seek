import type { Vector2 } from './ServerGameTypes.js';

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };
export const RIGHT_VECTOR: Vector2 = { x: 1, y: 0 };

const EPSILON = 0.00001;

export function cloneVector2(value: Vector2): Vector2 {
  return { x: value.x, y: value.y };
}

export function normalizeVector2(value: Vector2, fallback: Vector2 = ZERO_VECTOR): Vector2 {
  const length = Math.sqrt(value.x * value.x + value.y * value.y);
  if (length <= EPSILON) {
    return cloneVector2(fallback);
  }

  return {
    x: value.x / length,
    y: value.y / length,
  };
}

export function isNonZeroVector(value: Vector2): boolean {
  return value.x * value.x + value.y * value.y > EPSILON * EPSILON;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampVector2(value: Vector2, width: number, height: number): Vector2 {
  return {
    x: clamp(value.x, 0, width),
    y: clamp(value.y, 0, height),
  };
}

export function moveToward(position: Vector2, direction: Vector2, speed: number, deltaMs: number): Vector2 {
  const normalized = normalizeVector2(direction);
  if (!isNonZeroVector(normalized)) {
    return cloneVector2(position);
  }

  const distance = speed * (Math.max(0, deltaMs) / 1000);
  return {
    x: position.x + normalized.x * distance,
    y: position.y + normalized.y * distance,
  };
}

export function isPointInSector(
  origin: Vector2,
  facing: Vector2,
  point: Vector2,
  radius: number,
  angleDeg: number,
  targetRadius = 0
): boolean {
  const toPoint = {
    x: point.x - origin.x,
    y: point.y - origin.y,
  };
  const maxDistance = radius + Math.max(0, targetRadius);

  if (toPoint.x * toPoint.x + toPoint.y * toPoint.y > maxDistance * maxDistance) {
    return false;
  }

  if (!isNonZeroVector(toPoint)) {
    return true;
  }

  const normalizedFacing = normalizeVector2(facing, RIGHT_VECTOR);
  const normalizedToPoint = normalizeVector2(toPoint, RIGHT_VECTOR);
  const dot = normalizedFacing.x * normalizedToPoint.x + normalizedFacing.y * normalizedToPoint.y;
  const clampedDot = clamp(dot, -1, 1);
  const angleToPointDeg = Math.acos(clampedDot) * (180 / Math.PI);

  return angleToPointDeg <= angleDeg / 2;
}

export function facingToDegrees(facing: Vector2): number {
  const normalized = normalizeVector2(facing, RIGHT_VECTOR);
  return Math.atan2(normalized.y, normalized.x) * (180 / Math.PI);
}
