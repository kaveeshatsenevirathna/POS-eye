import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarRange } from '../apps/web/src/dates.ts';

test('daily reporting follows the business time zone', () => {
  const result = calendarRange(new Date('2026-11-20T20:00:00Z'), 'Asia/Colombo', 'today', '', '');
  assert.equal(result?.start.toISOString(), '2026-11-20T18:30:00.000Z');
  assert.equal(result?.end.toISOString(), '2026-11-21T18:30:00.000Z');
});
test('reporting across a daylight saving change uses local calendar boundaries', () => {
  const result = calendarRange(new Date('2026-03-08T16:00:00Z'), 'America/New_York', 'today', '', '');
  assert.equal(result?.start.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(result?.end.toISOString(), '2026-03-09T04:00:00.000Z');
});
test('custom windows include the end date and reject inverted ranges', () => {
  const now = new Date('2026-11-20T20:00:00Z');
  assert.equal(calendarRange(now, 'UTC', 'custom', '2026-10-01', '2026-10-01')?.end.toISOString(), '2026-10-02T00:00:00.000Z');
  assert.equal(calendarRange(now, 'UTC', 'custom', '2026-11-20', '2026-11-19'), null);
});
