import { expect, test } from 'vitest';
import { chartPoints, voltageRange } from '../src/components/charts/chartData';

test('keeps genuine zero readings, rejects invalid values, and sorts timestamps', () => {
  const points = chartPoints([
    { voltage: 2, receivedAt: '2026-11-10T10:02:00Z' },
    { voltage: 0, receivedAt: '2026-11-10T10:00:00Z' },
    { voltage: NaN, receivedAt: '2026-11-10T10:01:00Z' },
    { voltage: 3, receivedAt: 'invalid' },
    { voltage: null as unknown as number, receivedAt: '2026-11-10T10:03:00Z' },
  ]);
  expect(points.map(p => p.voltage)).toEqual([0, 2]);
  expect(points[0].time).toBeLessThan(points[1].time);
});

test('deduplicates timestamps so uPlot receives strictly ascending x values', () => {
  expect(chartPoints([
    { voltage: 1, receivedAt: '2026-11-10T10:00:00Z' },
    { voltage: 2, receivedAt: '2026-11-10T10:00:00Z' },
  ])).toEqual([{ time: Date.parse('2026-11-10T10:00:00Z') / 1000, voltage: 2 }]);
});

test('flat and single-point series have a visible nonzero range', () => {
  for (const value of [0, 0.001, -4, 1200]) {
    const [min, max] = voltageRange(value, value);
    expect(min).toBeLessThanOrEqual(value);
    expect(max).toBeGreaterThan(value);
  }
});

test('empty data stays empty and missing bounds get finite fallback limits', () => {
  expect(chartPoints([])).toEqual([]);
  expect(voltageRange(Infinity, -Infinity)).toEqual([0, 10]);
});

test('uses the typical 0–10 mV range without clipping outlying readings', () => {
  expect(voltageRange(0, 10)).toEqual([0, 10]);
  expect(voltageRange(2, 4)).toEqual([0, 10]);
  const [min, max] = voltageRange(-1, 12);
  expect(min).toBeLessThan(-1);
  expect(max).toBeGreaterThan(12);
});
