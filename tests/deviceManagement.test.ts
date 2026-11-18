import { afterEach, expect, test, vi } from 'vitest';
import { getRegisteredDevices, updateDeviceStatus, getProvisioningHistory } from '../src/services/deviceManagementApi';
import { listDashboardDevices } from '../src/services/dashboardDevicesApi';

vi.mock('../src/store', () => ({
  store: {
    getState: () => ({ user: { session: { accessToken: 'test-token', expiresAt: Date.now() + 60000 } } }),
    dispatch: vi.fn(),
  },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test.each([true, false])('device requests preserve authentication and use the correct URL with DEV=%s', async dev => {
  vi.stubEnv('DEV', dev);
  vi.stubEnv('VITE_AUTH_API_BASE_URL', 'https://auth.example/');
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ success: true, data: [] })));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  await getRegisteredDevices(controller.signal);
  await updateDeviceStatus('device-1', 'disabled');
  await getProvisioningHistory();
  await listDashboardDevices();
  const base = dev ? '/auth-backend' : 'https://auth.example';
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
    `${base}/api/getDevices`, `${base}/api/updateDevice`,
    `${base}/api/getProvisioningHistory`, `${base}/api/listDashboardDevices`,
  ]);
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer test-token');
  expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ deviceId: 'device-1', status: 'disabled' });
});
