import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, nextVersion, parseVersion } from './version.mjs';
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
