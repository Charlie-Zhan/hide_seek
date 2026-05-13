import type { Vector2 } from '@prop-hide-seek/shared';

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };
export const RIGHT_VECTOR: Vector2 = { x: 1, y: 0 };

const EPSILON = 0.00001;

export function cloneVector2(value: Vector2): Vector2 {
  return { x: value.x, y: value.y };
}

export function addVector2(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtractVector2(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVector2(value: Vector2, scalar: number): Vector2 {
  return { x: value.x * scalar, y: value.y * scalar };
}

export function vectorLengthSquared(value: Vector2): number {
  return value.x * value.x + value.y * value.y;
}

export function vectorLength(value: Vector2): number {
  return Math.sqrt(vectorLengthSquared(value));
}

export function normalizeVector2(value: Vector2, fallback: Vector2 = ZERO_VECTOR): Vector2 {
  const length = vectorLength(value);
  if (length <= EPSILON) {
    return cloneVector2(fallback);
  }

  return {
    x: value.x / length,
    y: value.y / length
  };
}

export function isNonZeroVector(value: Vector2): boolean {
  return vectorLengthSquared(value) > EPSILON * EPSILON;
}

export function distanceSquared(a: Vector2, b: Vector2): number {
  return vectorLengthSquared(subtractVector2(a, b));
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.sqrt(distanceSquared(a, b));
}

export function dotVector2(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function clampMagnitude(value: Vector2, maxLength: number): Vector2 {
  const length = vectorLength(value);
  if (length <= maxLength || length <= EPSILON) {
    return cloneVector2(value);
  }

  return scaleVector2(value, maxLength / length);
}

export function moveToward(position: Vector2, direction: Vector2, speed: number, deltaMs: number): Vector2 {
  const normalized = normalizeVector2(direction);
  if (!isNonZeroVector(normalized)) {
    return cloneVector2(position);
  }

  return addVector2(position, scaleVector2(normalized, speed * (deltaMs / 1000)));
}

export function isPointInSector(
  origin: Vector2,
  facing: Vector2,
  point: Vector2,
  radius: number,
  angleDeg: number,
  targetRadius = 0
): boolean {
  const toPoint = subtractVector2(point, origin);
  const maxDistance = radius + Math.max(0, targetRadius);

  if (vectorLengthSquared(toPoint) > maxDistance * maxDistance) {
    return false;
  }

  if (!isNonZeroVector(toPoint)) {
    return true;
  }

  const normalizedFacing = normalizeVector2(facing, RIGHT_VECTOR);
  const normalizedToPoint = normalizeVector2(toPoint, RIGHT_VECTOR);
  const clampedDot = Math.max(-1, Math.min(1, dotVector2(normalizedFacing, normalizedToPoint)));
  const angleToPointDeg = Math.acos(clampedDot) * (180 / Math.PI);

  return angleToPointDeg <= angleDeg / 2;
}

