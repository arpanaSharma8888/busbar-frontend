export function chartPoints(readings: { voltage: number; receivedAt: string }[]) {
  const points = new Map<number, number>();
  for (const reading of readings) {
    const time = Date.parse(reading.receivedAt) / 1000;
    // Missing readings must never become zero voltage.
    if (typeof reading.voltage === 'number' && Number.isFinite(reading.voltage) && Number.isFinite(time)) points.set(time, reading.voltage);
  }
  return [...points].sort(([a], [b]) => a - b).map(([time, voltage]) => ({ time, voltage }));
}

export function voltageRange(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const padding = Math.max((max - min) * 0.15, Math.abs(max) * 0.005, 0.01);
  return [min - padding, max + padding];
}
