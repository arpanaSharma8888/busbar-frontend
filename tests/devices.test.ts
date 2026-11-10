import { beforeEach, expect, test, vi } from 'vitest';
import { authenticatedFetch } from '../src/services/apiClient';
import { getAllDevices } from '../src/services/voltageApi';

vi.mock('../src/services/apiClient', () => ({ authenticatedFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

test('loads unique devices through the authenticated client with cancellation', async () => {
  const device = { deviceId: 'actual-device', macId: 'AA:BB:CC:DD:EE:FF' };
  vi.mocked(authenticatedFetch).mockResolvedValue(Response.json({ success: true, data: [device, device] }));
  const signal = new AbortController().signal;
  expect(await getAllDevices(signal)).toEqual([device]);
  expect(authenticatedFetch).toHaveBeenCalledWith('/api/getAllDevices', { signal });
});

test('accepts an empty device list', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValue(Response.json({ success: true, data: [] }));
  expect(await getAllDevices()).toEqual([]);
});

test('rejects malformed device records', async () => {
  vi.mocked(authenticatedFetch).mockResolvedValue(Response.json({ success: true, data: [{}] }));
  await expect(getAllDevices()).rejects.toThrow('Invalid device response');
});
