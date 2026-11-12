import { store } from '../store';
import { sessionExpired } from '../store/userSlice';

export interface DashboardDevice {
  deviceId: string;
  macId: string | null;
  status: 'pending' | 'active' | 'disabled';
  createdAt: string | null;
}

export async function listDashboardDevices(signal?: AbortSignal): Promise<DashboardDevice[]> {
  const session = store.getState().user.session;
  if (!session || session.expiresAt <= Date.now()) {
    store.dispatch(sessionExpired());
    throw new Error('Please sign in again.');
  }
  const base = import.meta.env.VITE_AUTH_API_BASE_URL;
  if (!base) throw new Error('VITE_AUTH_API_BASE_URL is not configured');
  const response = await fetch(`${base.replace(/\/$/, '')}/api/listDashboardDevices`, {
    headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
    cache: 'no-store', signal
  });
  if (response.status === 401) {
    store.dispatch(sessionExpired());
    throw new Error('Your session has expired.');
  }
  if (!response.ok) throw new Error(`Unable to fetch registered devices: ${response.status}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true || !('data' in result) || !Array.isArray(result.data)) {
    throw new Error('Invalid registered device response');
  }
  return result.data as DashboardDevice[];
}
