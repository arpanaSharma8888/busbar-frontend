import type { RegisteredDevice } from './deviceManagementApi';
import type { Identity } from './usbProvisioning';

/** A local preflight only; the API enforces ownership and transaction concurrency. */
export function provisioningAction(devices: RegisteredDevice[], identity: Identity): 'begin' | 'retry' {
  const mac = identity.macId.toUpperCase();
  if (devices.some(device => device.macId.toUpperCase() === mac && device.deviceId !== identity.deviceId)) {
    throw new Error('MAC address belongs to another device.');
  }
  const existing = devices.find(device => device.deviceId === identity.deviceId);
  if (!existing) return 'begin';
  if (existing.macId.toUpperCase() !== mac) throw new Error('Device ID belongs to a different controller.');
  if (!['pending', 'cancelled'].includes(existing.status)) {
    throw new Error(`This device is already ${existing.status}. Only incomplete provisioning attempts can be retried.`);
  }
  return 'retry';
}
