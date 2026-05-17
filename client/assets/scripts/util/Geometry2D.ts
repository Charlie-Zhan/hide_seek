import type { Vector2 } from '@prop-hide-seek/shared';

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };
export const RIGHT_VECTOR: Vector2 = { x: 1, y: 0 };

const EPSILON = 0.00001;

export interface Rect2 {
  position: Vector2;
  size: {
    width: number;
    height: number;
  };
}

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

export function circleIntersectsCircle(a: Vector2, aRadius: number, b: Vector2, bRadius: number): boolean {
  const radiusSum = Math.max(0, aRadius) + Math.max(0, bRadius);
  return distanceSquared(a, b) < radiusSum * radiusSum;
}

export function circleCircleSeparation(a: Vector2, aRadius: number, b: Vector2, bRadius: number): number {
  return distance(a, b) - (Math.max(0, aRadius) + Math.max(0, bRadius));
}

export function distanceSquaredToRect(point: Vector2, rect: Rect2): number {
  const minX = rect.position.x;
  const minY = rect.position.y;
  const maxX = rect.position.x + rect.size.width;
  const maxY = rect.position.y + rect.size.height;
  const clampedX = Math.max(minX, Math.min(maxX, point.x));
  const clampedY = Math.max(minY, Math.min(maxY, point.y));
  const dx = point.x - clampedX;
  const dy = point.y - clampedY;
  return dx * dx + dy * dy;
}

export function circleIntersectsRect(center: Vector2, radius: number, rect: Rect2): boolean {
  const safeRadius = Math.max(0, radius);
  return distanceSquaredToRect(center, rect) < safeRadius * safeRadius;
}

export function isPointInsideRect(point: Vector2, rect: Rect2): boolean {
  const minX = rect.position.x;
  const minY = rect.position.y;
  const maxX = rect.position.x + rect.size.width;
  const maxY = rect.position.y + rect.size.height;
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

export function circleRectSeparation(center: Vector2, radius: number, rect: Rect2): number {
  const safeRadius = Math.max(0, radius);
  if (isPointInsideRect(center, rect)) {
    const minX = rect.position.x;
    const minY = rect.position.y;
    const maxX = rect.position.x + rect.size.width;
    const maxY = rect.position.y + rect.size.height;
    const nearestEdgeDistance = Math.min(
      center.x - minX,
      maxX - center.x,
      center.y - minY,
      maxY - center.y
    );
    return -(safeRadius + Math.max(0, nearestEdgeDistance));
  }

  return Math.sqrt(distanceSquaredToRect(center, rect)) - safeRadius;
}

export function clampCircleToBounds(position: Vector2, radius: number, width: number, height: number): Vector2 {
  const safeRadius = Math.max(0, radius);
  return {
    x: Math.max(safeRadius, Math.min(width - safeRadius, position.x)),
    y: Math.max(safeRadius, Math.min(height - safeRadius, position.y))
  };
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
  const safeRadius = Math.max(0, radius);
  const safeTargetRadius = Math.max(0, targetRadius);
  const maxDistance = safeRadius + safeTargetRadius;

  if (vectorLengthSquared(toPoint) > maxDistance * maxDistance) {
    return false;
  }

  const distanceToCenter = vectorLength(toPoint);
  if (distanceToCenter <= safeTargetRadius || distanceToCenter <= EPSILON) {
    return true;
  }

  const normalizedFacing = normalizeVector2(facing, RIGHT_VECTOR);
  const normalizedToPoint = normalizeVector2(toPoint, RIGHT_VECTOR);
  const clampedDot = Math.max(-1, Math.min(1, dotVector2(normalizedFacing, normalizedToPoint)));
  const angleToPointDeg = Math.acos(clampedDot) * (180 / Math.PI);
  const halfAngleDeg = Math.max(0, Math.min(180, angleDeg / 2));

  if (angleToPointDeg <= halfAngleDeg) {
    return true;
  }

  if (safeTargetRadius <= EPSILON || safeRadius <= EPSILON) {
    return false;
  }

  const angularPaddingDeg = Math.asin(Math.min(1, safeTargetRadius / distanceToCenter)) * (180 / Math.PI);
  if (
    distanceToCenter >= safeRadius - safeTargetRadius &&
    distanceToCenter <= safeRadius + safeTargetRadius &&
    angleToPointDeg <= halfAngleDeg + angularPaddingDeg
  ) {
    return true;
  }

  const halfAngleRad = halfAngleDeg * (Math.PI / 180);
  const leftRay = rotateVector2(normalizedFacing, halfAngleRad);
  const rightRay = rotateVector2(normalizedFacing, -halfAngleRad);
  return (
    distanceSquaredToSegment(point, origin, addVector2(origin, scaleVector2(leftRay, safeRadius))) <= safeTargetRadius * safeTargetRadius ||
    distanceSquaredToSegment(point, origin, addVector2(origin, scaleVector2(rightRay, safeRadius))) <= safeTargetRadius * safeTargetRadius
  );
}

function rotateVector2(value: Vector2, radians: number): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: value.x * cos - value.y * sin,
    y: value.x * sin + value.y * cos
  };
}

function distanceSquaredToSegment(point: Vector2, start: Vector2, end: Vector2): number {
  const segment = subtractVector2(end, start);
  const lengthSq = vectorLengthSquared(segment);
  if (lengthSq <= EPSILON) {
    return distanceSquared(point, start);
  }

  const t = Math.max(0, Math.min(1, dotVector2(subtractVector2(point, start), segment) / lengthSq));
  const closest = {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t
  };
  return distanceSquared(point, closest);
}

