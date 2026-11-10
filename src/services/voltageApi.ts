
import type {
  LatestVoltageResponse,
} from '../types/voltage';

import { authenticatedFetch } from './apiClient';

async function readVoltageJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('+json')) {
    throw new Error('The voltage API returned a non-JSON response. Check VITE_API_BASE_URL. For deployed sites, configure the API URL in the build environment and rebuild and redeploy the frontend. For local development, check the /backend proxy and restart Vite.');
  }
  return response.json();
}

export async function getLatestVoltage(
  deviceId: string,
  signal?: AbortSignal
): Promise<LatestVoltageResponse> {
  const params = new URLSearchParams({ deviceId });

  const response = await authenticatedFetch(
    `/api/getLatestVoltage?${params}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return readVoltageJson<LatestVoltageResponse>(response);
}

import type {
  HistoricalVoltageResponse,
} from '../types/voltage';

export async function getHistoricalVoltage(
  deviceId: string,
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<HistoricalVoltageResponse> {
  const params = new URLSearchParams({ deviceId, from, to });

  const response = await authenticatedFetch(
    `/api/getHistoricalVoltage?${params}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`Historical API failed: ${response.status}`);
  }

  return readVoltageJson<HistoricalVoltageResponse>(response);
}


export interface BusbarDevice {
  deviceId: string;
  macId: string | null;
}

export async function getAllDevices(signal?: AbortSignal): Promise<BusbarDevice[]> {
  const response = await authenticatedFetch('/api/getAllDevices', { signal });
  if (!response.ok) throw new Error(`Unable to fetch devices: ${response.status}`);
  const result = await readVoltageJson<{ success: boolean; data: BusbarDevice[] }>(response);
  if (!result.success || !Array.isArray(result.data) || result.data.some(device =>
    !device || typeof device.deviceId !== 'string' || !device.deviceId.trim()
    || (device.macId !== null && typeof device.macId !== 'string'))) {
    throw new Error('Invalid device response');
  }
  return [...new Map(result.data.map(device => [device.deviceId, device])).values()];
}
