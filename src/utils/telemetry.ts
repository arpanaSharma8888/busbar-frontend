// Freshness describes received data, not the registry's active/disabled setting.
export const FRESHNESS_LIMIT_MS = 60_000;

export function formatVoltage(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '—';
}

export function readingStatus(receivedAt: string | undefined, now: number) {
  if (!receivedAt) {
    return { label: 'No data', color: 'gray', fresh: false } as const;
  }
  const timestamp = Date.parse(receivedAt);
  if (!Number.isFinite(timestamp) || timestamp > now) {
    return { label: 'Invalid timestamp', color: 'orange', fresh: false } as const;
  }
  if (now - timestamp > FRESHNESS_LIMIT_MS) {
    return { label: 'Stale data', color: 'orange', fresh: false } as const;
  }
  return { label: 'Receiving', color: 'teal', fresh: true } as const;
}

export function readingTime(receivedAt: string | undefined): string {
  if (!receivedAt || !Number.isFinite(Date.parse(receivedAt))) {
    return 'No valid timestamp';
  }
  return new Date(receivedAt).toLocaleString();
}

export function latestReadingTime(readings: { receivedAt: string }[]): string | undefined {
  return readings.reduce<string | undefined>((latest, reading) => {
    const timestamp = Date.parse(reading.receivedAt);
    if (!Number.isFinite(timestamp)) {
      return latest;
    }
    return !latest || timestamp > Date.parse(latest) ? reading.receivedAt : latest;
  }, undefined);
}
