
import { store } from '../store';
import { sessionExpired } from '../store/userSlice';

export interface RegisteredDevice {
  deviceId: string;
  macId: string;
  status: 'pending' | 'active' | 'disabled';
  credentialVersion: number;
  createdAt: string;
}

export interface DeviceRegistrationResponse {
  success: boolean;
  device: RegisteredDevice;
  deviceSecret: string;
}

async function deviceRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const session = store.getState().user.session;

  if (!session || session.expiresAt <= Date.now()) {
    store.dispatch(sessionExpired());
    throw new Error('Please sign in to continue.');
  }

  const base = import.meta.env.VITE_AUTH_API_BASE_URL;

  if (!base) {
    throw new Error('VITE_AUTH_API_BASE_URL is not configured.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  headers.set('Accept', 'application/json');

  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(
    `${base.replace(/\/$/, '')}${path}`,
    {
      ...options,
      headers,
      cache: 'no-store',
      redirect: 'error',
    }
  );

  if (response.status === 401) {
    if (store.getState().user.session === session) {
      store.dispatch(sessionExpired());
    }
    throw new Error('Your session expired. Please sign in again.');
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : `Request failed (${response.status})`
    );
  }

  return data as T;
}

export async function getRegisteredDevices(
  signal?: AbortSignal
): Promise<RegisteredDevice[]> {
  const result = await deviceRequest<{
    success: boolean;
    data: RegisteredDevice[];
  }>('/api/getDevices', { signal });

  if (!result?.success || !Array.isArray(result.data)) {
    throw new Error('Invalid device registry response.');
  }

  return result.data;
}

export async function registerDevice(
  deviceId: string,
  macId: string
): Promise<DeviceRegistrationResponse> {
  const result = await deviceRequest<DeviceRegistrationResponse>(
    '/api/registerDevice',
    {
      method: 'POST',
      body: JSON.stringify({ deviceId, macId }),
    }
  );

  if (
    !result?.success ||
    !result.device ||
    typeof result.deviceSecret !== 'string'
  ) {
    throw new Error('Invalid device registration response.');
  }

  return result;
}


export async function updateDeviceStatus(
  deviceId: string,
  status: 'active' | 'disabled'
): Promise<void> {
  const result = await deviceRequest<{
    success: boolean;
  }>('/api/updateDevice', {
    method: 'PATCH',
    body: JSON.stringify({ deviceId, status }),
  });

  if (!result?.success) {
    throw new Error('Unable to update device status.');
  }
}

