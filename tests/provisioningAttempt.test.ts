import { expect, test } from 'vitest';
import { provisioningAction } from '../src/services/provisioningAttempt';
import type { RegisteredDevice } from '../src/services/deviceManagementApi';

const identity = { deviceId: '1', macId: '02:4B:B3:B9:EB:E5' };
const device: RegisteredDevice = { ...identity, status: 'pending', credentialVersion: 1, createdAt: '' };

test('new controllers begin a transaction', () => {
  expect(provisioningAction([], identity)).toBe('begin');
});

test.each(['pending', 'cancelled'] as const)('allows retry of an incomplete %s controller', status => {
  expect(provisioningAction([{ ...device, status, macId: device.macId.toLowerCase() }], identity)).toBe('retry');
});

test.each(['active', 'disabled'] as const)('does not overwrite an already %s controller', status => {
  expect(() => provisioningAction([{ ...device, status }], identity)).toThrow(`already ${status}`);
});

test('rejects both identity conflicts', () => {
  expect(() => provisioningAction([{ ...device, macId: '02:4B:B3:B9:EB:E6' }], identity)).toThrow('different controller');
  expect(() => provisioningAction([{ ...device, deviceId: '2' }], identity)).toThrow('another device');
});
