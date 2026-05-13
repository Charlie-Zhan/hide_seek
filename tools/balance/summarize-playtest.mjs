#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { summarizePlaytestRecords } from './BalanceSummary.mjs';

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node tools/balance/summarize-playtest.mjs <playtest-records.json>');
  process.exitCode = 1;
} else {
  try {
    const raw = await readFile(inputPath, 'utf8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    const summary = summarizePlaytestRecords(records);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
