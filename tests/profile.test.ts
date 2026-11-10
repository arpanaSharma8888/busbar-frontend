import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { changePasswordRequest, updateProfileRequest } from '../src/services/authApi';
const session = { accessToken: 'token', expiresAt: Date.now() + 3600000, user: { id: '1', username: 'operator', name: 'Old name', role: 'viewer' } };
beforeEach(() => vi.stubEnv('DEV', false));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('profile PATCH sends only the trimmed name with authorization', async () => {
  vi.stubEnv('VITE_AUTH_API_BASE_URL', 'http://localhost:7071');
  const user = { ...session.user, name: 'New name' };
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, user }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await updateProfileRequest(session, ' New name ')).toEqual(user);
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7071/api/updateProfile');
  expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'New name' });
});

test.each([' ', 'a', 'a'.repeat(101)])('rejects invalid display name before sending', async name => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await expect(updateProfileRequest(session, name)).rejects.toThrow('2?100');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('surfaces backend conflict without reporting success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Profile changed. Refresh and try again.' }, { status: 409 })));
  await expect(updateProfileRequest(session, 'New name')).rejects.toThrow('Profile changed. Refresh and try again.');
});


test('password change sends exact passwords and requires server confirmation', async () => {
  vi.stubEnv('VITE_AUTH_API_BASE_URL', 'http://localhost:7071');
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal('fetch', fetchMock);
  await changePasswordRequest(session, ' current password ', ' new password with spaces ');
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7071/api/changePassword');
  expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ currentPassword: ' current password ', newPassword: ' new password with spaces ' });
});

test.each([['', 'valid new password'], ['old', 'short'], ['same password', 'same password'], ['old', 'x'.repeat(1025)]])('invalid passwords do not reach backend', async (current, next) => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await expect(changePasswordRequest(session, current, next)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('incorrect current password surfaces backend message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: false, message: 'Current password is incorrect.' }, { status: 400 })));
  await expect(changePasswordRequest(session, 'old', 'valid new password')).rejects.toThrow('Current password is incorrect.');
});
