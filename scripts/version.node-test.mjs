import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isoWeek, nextDate, nextVersion, parseVersion, releaseDay } from './version.mjs';
test('ISO week follows the ISO year across New Year', () => {
  assert.deepEqual(isoWeek(new Date('2027-01-01')), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(new Date('2026-10-26')), { year: 2026, week: 44 });
});
test('rejects leading zeros and nonexistent ISO weeks', () => {
  for (const v of ['2026.03.0', '2026-44', '2025.53.0', '2026.44.65536']) assert.throws(() => parseVersion(v));
});
test('increments the highest release in the week, then resets next week', () => {
  assert.equal(nextVersion(new Date('2026-10-26'), ['v2026.44.2', '2026.44.0', '0.13.0']), '2026.44.3');
  assert.equal(nextVersion(new Date('2026-11-02'), ['v2026.44.2']), '2026.45.0');
});
test('next without a date uses the local calendar day, not the UTC day (knownbug 255)', () => {
  // Maandag 2 november 2026, 00:30 lokale tijd; in Europa is het in UTC dan nog zondag (week 44).
  assert.deepEqual(isoWeek(releaseDay(new Date(2026, 10, 2, 0, 30))), { year: 2026, week: 45 });
  assert.deepEqual(isoWeek(releaseDay(new Date(2026, 10, 1, 23, 30))), { year: 2026, week: 44 });
});
test('main next uses nextDate: local calendar day without a date, even on a UTC runner (knownbug 255)', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Amsterdam'; // Node leest TZ opnieuw; zo test dit ook op een CI-runner in UTC
  try {
    const mondayEarly = new Date(2026, 10, 2, 0, 30);
    assert.equal(mondayEarly.toISOString().slice(0, 10), '2026-11-01'); // in UTC nog zondag
    assert.deepEqual(isoWeek(nextDate(undefined, mondayEarly)), { year: 2026, week: 45 });
    assert.deepEqual(isoWeek(nextDate('2026-11-01', mondayEarly)), { year: 2026, week: 44 });
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
  const source = readFileSync(new URL('./version.mjs', import.meta.url), 'utf8');
  assert.match(source, /nextVersion\(nextDate\(value\),/);
});
