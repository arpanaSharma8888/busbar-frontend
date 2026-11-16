
import { store } from '../store';
import { sessionExpired } from '../store/userSlice';

export interface RegisteredDevice {
  deviceId: string;
  macId: string;
  status: 'pending' | 'active' | 'disabled' | 'cancelled';
  provisioningExpiresAt?: string;
  provisioningState?: string;
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

export interface BeginProvisioningResponse {
  success: true;
  deviceId: string;
  macId: string;
  transactionId: string;
  challenge: string;
  expiresAt: string;
  apimUrl: string;
  deviceSecret: string;
}
export async function beginDeviceProvisioning(deviceId: string, macId: string): Promise<BeginProvisioningResponse> {
  return deviceRequest<BeginProvisioningResponse>('/api/beginDeviceProvisioning', {
    method: 'POST', body: JSON.stringify({ deviceId, macId })
  });
}
export async function completeDeviceProvisioning(deviceId: string, transactionId: string, proof: string): Promise<void> {
  const result = await deviceRequest<{success:boolean}>('/api/completeDeviceProvisioning', {
    method: 'POST', body: JSON.stringify({ deviceId, transactionId, proof })
  });
  if (!result.success) throw new Error('Provisioning could not be completed.');
}
export async function cancelDeviceProvisioning(deviceId: string, transactionId: string): Promise<void> {
  const result = await deviceRequest<{success:boolean}>('/api/cancelDeviceProvisioning', {
    method: 'POST', body: JSON.stringify({ deviceId, transactionId })
  });
  if (!result.success) throw new Error('Unable to cancel provisioning.');
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



export async function retryCancelledProvisioning(deviceId: string, macId: string): Promise<BeginProvisioningResponse> {
  return deviceRequest<BeginProvisioningResponse>('/api/retryCancelledProvisioning', {
    method: 'POST', body: JSON.stringify({ deviceId, macId, erasureConfirmed: true })
  });
}
export interface ProvisioningHistoryRecord {
  deviceId: string; transactionId: string; macId: string; status: string; createdAt: string; closedAt: string;
}
export async function getProvisioningHistory(): Promise<ProvisioningHistoryRecord[]> {
  const result = await deviceRequest<{success:boolean;data:ProvisioningHistoryRecord[]}>('/api/getProvisioningHistory');
  if (!result.success || !Array.isArray(result.data)) throw new Error('Invalid provisioning history response');
  return result.data;
}
