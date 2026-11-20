import { expect, test } from 'vitest';
import {
  formatVoltage,
  latestReadingTime,
  readingStatus,
  readingTime,
} from '../src/utils/telemetry';

const now = Date.parse('2026-11-20T10:00:00Z');

test('only timestamps within 60 seconds indicate receiving data', () => {
  expect(readingStatus(new Date(now).toISOString(), now).fresh).toBe(true);
  expect(readingStatus(new Date(now - 60_000).toISOString(), now).fresh).toBe(true);
  expect(readingStatus(new Date(now - 60_001).toISOString(), now)).toMatchObject({
    fresh: false,
    label: 'Stale data',
  });
  expect(readingStatus(undefined, now)).toMatchObject({ fresh: false, label: 'No data' });
  expect(readingStatus('invalid', now).fresh).toBe(false);
  expect(readingStatus(new Date(now + 1000).toISOString(), now).fresh).toBe(false);
});

test('a retained reading ages out even without a new API response', () => {
  const receivedAt = new Date(now).toISOString();
  expect(readingStatus(receivedAt, now + 30_000).fresh).toBe(true);
  expect(readingStatus(receivedAt, now + 61_000).fresh).toBe(false);
});

test.each([
  [10.8, '10.8'],
  [10, '10'],
  [0, '0'],
  [10.125, '10.125'],
  [10.1236, '10.124'],
  [-0.001, '-0.001'],
  [NaN, '—'],
  [Infinity, '—'],
])('formats %s without redundant trailing zeroes', (value, expected) => {
  expect(formatVoltage(value)).toBe(expected);
});

test('finds the latest sample without depending on API order', () => {
  expect(
    latestReadingTime([
      { receivedAt: '2026-11-20T10:00:00Z' },
      { receivedAt: 'invalid' },
      { receivedAt: '2026-11-20T09:00:00Z' },
    ]),
  ).toBe('2026-11-20T10:00:00Z');
  expect(latestReadingTime([])).toBeUndefined();
  expect(readingTime('invalid')).toBe('No valid timestamp');
});
