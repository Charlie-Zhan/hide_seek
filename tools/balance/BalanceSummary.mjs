export const BALANCE_TARGETS = Object.freeze({
  2: Object.freeze({
    requiredRoundCount: 5,
    metrics: Object.freeze({
      averageCaptures: Object.freeze({ min: 0.45, max: 0.75 }),
      fullCaptureRate: Object.freeze({ min: 0.25, max: 0.45 }),
      atLeastOneSurvivedRate: Object.freeze({ min: 0.55, max: 0.75 }),
      attacksDepletedRate: Object.freeze({ min: 0.25, max: 0.6 }),
      averageDurationSec: Object.freeze({ min: 120, max: 240 }),
    }),
  }),
  3: Object.freeze({
    requiredRoundCount: 5,
    metrics: Object.freeze({
      averageCaptures: Object.freeze({ min: 0.8, max: 1.35 }),
      fullCaptureRate: Object.freeze({ min: 0.2, max: 0.4 }),
      atLeastOneSurvivedRate: Object.freeze({ min: 0.6, max: 0.8 }),
      attacksDepletedRate: Object.freeze({ min: 0.3, max: 0.6 }),
      averageDurationSec: Object.freeze({ min: 180, max: 300 }),
    }),
  }),
  4: Object.freeze({
    requiredRoundCount: 10,
    metrics: Object.freeze({
      averageCaptures: Object.freeze({ min: 1, max: 2 }),
      fullCaptureRate: Object.freeze({ min: 0.15, max: 0.35 }),
      atLeastOneSurvivedRate: Object.freeze({ min: 0.6, max: 0.8 }),
      attacksDepletedRate: Object.freeze({ min: 0.3, max: 0.6 }),
      averageDurationSec: Object.freeze({ min: 240, max: 360 }),
    }),
  }),
});

export const METRIC_LABELS = Object.freeze({
  averageCaptures: 'Average captures',
  fullCaptureRate: 'Full capture rate',
  atLeastOneSurvivedRate: 'At least one hider survived rate',
  attacksDepletedRate: 'Attacks depleted rate',
  averageDurationSec: 'Average match duration',
});

const SUPPORTED_PLAYER_COUNTS = Object.freeze([2, 3, 4]);
const ATTACKS_DEPLETED_REASONS = new Set(['attacks_used', 'attacks_depleted']);

export function summarizePlaytestRecords(records, options = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError('Expected playtest records to be an array.');
  }

  const playerCounts = options.playerCounts ?? SUPPORTED_PLAYER_COUNTS;
  const normalizedRecords = records.map(normalizeRecord);
  const summaries = {};

  for (const playerCount of playerCounts) {
    const target = BALANCE_TARGETS[playerCount];
    if (!target) {
      throw new RangeError(`Unsupported player count: ${playerCount}. Expected 2, 3, or 4.`);
    }

    const group = normalizedRecords.filter((record) => record.playerCount === playerCount);
    const metrics = calculateMetrics(group, playerCount);
    summaries[playerCount] = {
      playerCount,
      hiderCount: playerCount - 1,
      roundCount: group.length,
      requiredRoundCount: target.requiredRoundCount,
      sampleStatus: group.length >= target.requiredRoundCount ? 'enough_data' : 'needs_more_data',
      metrics,
      evaluation: evaluateMetrics(metrics, target.metrics),
    };
  }

  return summaries;
}

export function evaluateMetrics(metrics, targetMetrics) {
  return Object.fromEntries(
    Object.entries(targetMetrics).map(([metricName, range]) => {
      const value = metrics[metricName];
      return [
        metricName,
        {
          label: METRIC_LABELS[metricName] ?? metricName,
          value,
          min: range.min,
          max: range.max,
          status: getRangeStatus(value, range),
        },
      ];
    }),
  );
}

export function getRangeStatus(value, range) {
  if (value == null || Number.isNaN(value)) {
    return 'missing';
  }
  if (value < range.min) {
    return 'below_target';
  }
  if (value > range.max) {
    return 'above_target';
  }
  return 'within_target';
}

function calculateMetrics(records, playerCount) {
  if (records.length === 0) {
    return {
      averageCaptures: null,
      fullCaptureRate: null,
      atLeastOneSurvivedRate: null,
      attacksDepletedRate: null,
      averageRoundDurationSec: null,
      averageDurationSec: null,
    };
  }

  const matchDurations = collectMatchDurations(records, playerCount);

  return {
    averageCaptures: round(records.reduce((sum, record) => sum + record.captures, 0) / records.length),
    fullCaptureRate: round(records.filter((record) => record.captures >= record.hiderCount).length / records.length),
    atLeastOneSurvivedRate: round(records.filter((record) => record.captures < record.hiderCount).length / records.length),
    attacksDepletedRate: round(records.filter((record) => record.attacksDepleted).length / records.length),
    averageRoundDurationSec: round(records.reduce((sum, record) => sum + record.roundDurationSec, 0) / records.length),
    averageDurationSec: round(matchDurations.reduce((sum, durationSec) => sum + durationSec, 0) / matchDurations.length),
  };
}

function collectMatchDurations(records, playerCount) {
  const explicitDurations = records
    .map((record) => record.matchDurationSec)
    .filter((durationSec) => durationSec != null);

  if (explicitDurations.length > 0) {
    return explicitDurations;
  }

  const durationsByMatchId = new Map();
  for (const record of records) {
    if (record.matchId == null) {
      continue;
    }
    durationsByMatchId.set(record.matchId, (durationsByMatchId.get(record.matchId) ?? 0) + record.roundDurationSec);
  }

  if (durationsByMatchId.size > 0) {
    return [...durationsByMatchId.values()];
  }

  return records.map((record) => record.roundDurationSec * playerCount);
}

function normalizeRecord(record, index) {
  if (record == null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(`Record ${index} must be an object.`);
  }

  const playerCount = requireInteger(record.playerCount, `records[${index}].playerCount`);
  if (!SUPPORTED_PLAYER_COUNTS.includes(playerCount)) {
    throw new RangeError(`records[${index}].playerCount must be 2, 3, or 4.`);
  }

  const hiderCount = record.hiderCount == null
    ? playerCount - 1
    : requireInteger(record.hiderCount, `records[${index}].hiderCount`);
  if (hiderCount !== playerCount - 1) {
    throw new RangeError(`records[${index}].hiderCount must equal playerCount - 1.`);
  }

  const captures = requireInteger(record.captures, `records[${index}].captures`);
  if (captures < 0 || captures > hiderCount) {
    throw new RangeError(`records[${index}].captures must be between 0 and ${hiderCount}.`);
  }

  const roundDurationSec = readDurationSec(record, index);
  const matchDurationSec = readOptionalNumber(record.matchDurationSec, `records[${index}].matchDurationSec`);
  const attackCountRemaining = readOptionalInteger(record.attackCountRemaining, `records[${index}].attackCountRemaining`);
  const attacksDepleted = record.attacksDepleted === true
    || attackCountRemaining === 0
    || (typeof record.endReason === 'string' && ATTACKS_DEPLETED_REASONS.has(record.endReason));

  return {
    playerCount,
    hiderCount,
    captures,
    roundDurationSec,
    matchDurationSec,
    matchId: typeof record.matchId === 'string' && record.matchId.trim().length > 0 ? record.matchId.trim() : null,
    attacksDepleted,
  };
}

function readDurationSec(record, index) {
  const duration = record.roundDurationSec ?? record.durationSec;
  return requirePositiveNumber(duration, `records[${index}].roundDurationSec`);
}

function requireInteger(value, fieldName) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${fieldName} must be an integer.`);
  }
  return value;
}

function readOptionalInteger(value, fieldName) {
  if (value == null) {
    return null;
  }
  return requireInteger(value, fieldName);
}

function readOptionalNumber(value, fieldName) {
  if (value == null) {
    return null;
  }
  return requirePositiveNumber(value, fieldName);
}

function requirePositiveNumber(value, fieldName) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive number.`);
  }
  return value;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
