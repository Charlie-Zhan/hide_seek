export function secondsToMs(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return 0;
  }

  return Math.max(0, Math.round(seconds * 1000));
}

export function msToSecondsCeil(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) {
    return 0;
  }

  return Math.max(0, Math.ceil(milliseconds / 1000));
}

export function clampMs(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) {
    return 0;
  }

  return Math.max(0, Math.round(milliseconds));
}

export function getRemainingMs(endsAtMs: number, nowMs: number): number {
  return clampMs(endsAtMs - nowMs);
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = msToSecondsCeil(milliseconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatSeconds(milliseconds: number): string {
  return msToSecondsCeil(milliseconds).toString();
}
