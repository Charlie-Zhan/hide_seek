import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRangeStatus,
  summarizePlaytestRecords,
} from '../../tools/balance/BalanceSummary.mjs';

test('summarizes 4-player balance records against Phase 07 targets', () => {
  const captures = [3, 3, 3, 2, 2, 1, 1, 0, 0, 0];
  const records = captures.map((captureCount, index) => ({
    matchId: `4p-${index + 1}`,
    playerCount: 4,
    hiderCount: 3,
    captures: captureCount,
    attackCountRemaining: index < 5 ? 0 : 1,
    roundDurationSec: 75,
    matchDurationSec: 300,
  }));

  const summary = summarizePlaytestRecords(records);
  const fourPlayerSummary = summary[4];

  assert.equal(fourPlayerSummary.roundCount, 10);
  assert.equal(fourPlayerSummary.sampleStatus, 'enough_data');
  assert.equal(fourPlayerSummary.metrics.averageCaptures, 1.5);
  assert.equal(fourPlayerSummary.metrics.fullCaptureRate, 0.3);
  assert.equal(fourPlayerSummary.metrics.atLeastOneSurvivedRate, 0.7);
  assert.equal(fourPlayerSummary.metrics.attacksDepletedRate, 0.5);
  assert.equal(fourPlayerSummary.metrics.averageDurationSec, 300);

  for (const result of Object.values(fourPlayerSummary.evaluation)) {
    assert.equal(result.status, 'within_target');
  }
});

test('marks missing groups and insufficient sample sizes', () => {
  const summary = summarizePlaytestRecords([
    {
      playerCount: 2,
      captures: 1,
      endReason: 'all_captured',
      roundDurationSec: 70,
    },
  ]);

  assert.equal(summary[2].roundCount, 1);
  assert.equal(summary[2].sampleStatus, 'needs_more_data');
  assert.equal(summary[2].metrics.fullCaptureRate, 1);
  assert.equal(summary[2].evaluation.fullCaptureRate.status, 'above_target');

  assert.equal(summary[3].roundCount, 0);
  assert.equal(summary[3].evaluation.averageCaptures.status, 'missing');
});

test('derives attack depletion from end reason or remaining attacks', () => {
  const summary = summarizePlaytestRecords([
    {
      playerCount: 3,
      captures: 1,
      endReason: 'attacks_used',
      roundDurationSec: 60,
    },
    {
      playerCount: 3,
      captures: 1,
      attackCountRemaining: 0,
      roundDurationSec: 60,
    },
    {
      playerCount: 3,
      captures: 0,
      attackCountRemaining: 2,
      roundDurationSec: 60,
    },
  ]);

  assert.equal(summary[3].metrics.attacksDepletedRate, 0.667);
});

test('rejects records that do not match MVP player and capture bounds', () => {
  assert.throws(
    () => summarizePlaytestRecords([{ playerCount: 5, captures: 0, roundDurationSec: 60 }]),
    /playerCount must be 2, 3, or 4/,
  );

  assert.throws(
    () => summarizePlaytestRecords([{ playerCount: 2, captures: 2, roundDurationSec: 60 }]),
    /captures must be between 0 and 1/,
  );
});

test('reports range statuses consistently', () => {
  const target = { min: 10, max: 20 };

  assert.equal(getRangeStatus(9, target), 'below_target');
  assert.equal(getRangeStatus(10, target), 'within_target');
  assert.equal(getRangeStatus(20, target), 'within_target');
  assert.equal(getRangeStatus(21, target), 'above_target');
  assert.equal(getRangeStatus(null, target), 'missing');
});
