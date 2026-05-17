import type { Vector2 } from './ServerGameTypes.js';

export const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };
export const RIGHT_VECTOR: Vector2 = { x: 1, y: 0 };

const EPSILON = 0.00001;

export interface Rect2 {
  readonly position: Vector2;
  readonly size: {
    readonly width: number;
    readonly height: number;
  };
}

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

export function clampCircleToBounds(value: Vector2, radius: number, width: number, height: number): Vector2 {
  const safeRadius = Math.max(0, radius);
  return {
    x: clamp(value.x, safeRadius, width - safeRadius),
    y: clamp(value.y, safeRadius, height - safeRadius),
  };
}

export function distanceSquared(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function circleIntersectsCircle(a: Vector2, aRadius: number, b: Vector2, bRadius: number): boolean {
  const radiusSum = Math.max(0, aRadius) + Math.max(0, bRadius);
  return distanceSquared(a, b) < radiusSum * radiusSum;
}

export function circleCircleSeparation(a: Vector2, aRadius: number, b: Vector2, bRadius: number): number {
  return Math.sqrt(distanceSquared(a, b)) - (Math.max(0, aRadius) + Math.max(0, bRadius));
}

export function distanceSquaredToRect(point: Vector2, rect: Rect2): number {
  const minX = rect.position.x;
  const minY = rect.position.y;
  const maxX = rect.position.x + rect.size.width;
  const maxY = rect.position.y + rect.size.height;
  const clampedX = clamp(point.x, minX, maxX);
  const clampedY = clamp(point.y, minY, maxY);
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
  const safeRadius = Math.max(0, radius);
  const safeTargetRadius = Math.max(0, targetRadius);
  const maxDistance = safeRadius + safeTargetRadius;

  if (toPoint.x * toPoint.x + toPoint.y * toPoint.y > maxDistance * maxDistance) {
    return false;
  }

  const distanceToCenter = Math.sqrt(toPoint.x * toPoint.x + toPoint.y * toPoint.y);
  if (distanceToCenter <= safeTargetRadius || distanceToCenter <= EPSILON) {
    return true;
  }

  const normalizedFacing = normalizeVector2(facing, RIGHT_VECTOR);
  const normalizedToPoint = normalizeVector2(toPoint, RIGHT_VECTOR);
  const dot = normalizedFacing.x * normalizedToPoint.x + normalizedFacing.y * normalizedToPoint.y;
  const clampedDot = clamp(dot, -1, 1);
  const angleToPointDeg = Math.acos(clampedDot) * (180 / Math.PI);
  const halfAngleDeg = clamp(angleDeg / 2, 0, 180);

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
    distanceSquaredToSegment(point, origin, {
      x: origin.x + leftRay.x * safeRadius,
      y: origin.y + leftRay.y * safeRadius,
    }) <= safeTargetRadius * safeTargetRadius ||
    distanceSquaredToSegment(point, origin, {
      x: origin.x + rightRay.x * safeRadius,
      y: origin.y + rightRay.y * safeRadius,
    }) <= safeTargetRadius * safeTargetRadius
  );
}

function rotateVector2(value: Vector2, radians: number): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: value.x * cos - value.y * sin,
    y: value.x * sin + value.y * cos,
  };
}

function distanceSquaredToSegment(point: Vector2, start: Vector2, end: Vector2): number {
  const segment = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const lengthSq = segment.x * segment.x + segment.y * segment.y;
  if (lengthSq <= EPSILON) {
    return distanceSquared(point, start);
  }

  const t = clamp(((point.x - start.x) * segment.x + (point.y - start.y) * segment.y) / lengthSq, 0, 1);
  const closest = {
    x: start.x + segment.x * t,
    y: start.y + segment.y * t,
  };
  return distanceSquared(point, closest);
}

export function facingToDegrees(facing: Vector2): number {
  const normalized = normalizeVector2(facing, RIGHT_VECTOR);
  return Math.atan2(normalized.y, normalized.x) * (180 / Math.PI);
}
