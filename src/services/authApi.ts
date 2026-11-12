import { isSession } from './session';
import type { Session, User } from './session';

export interface LoginCredentials { username: string; password: string; remember: boolean }

export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('VITE_API_BASE_URL is not configured');
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API path must start with a single slash');
  return `${base.replace(/\/$/, '')}${path.replace(/^\/api\//, '/api/read/')}`;
}

export async function loginRequest(credentials: LoginCredentials, signal: AbortSignal): Promise<Session> {
  const response = await fetch(authUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: credentials.username.trim(), password: credentials.password }),
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Invalid username or password.');
    if (response.status === 429) throw new Error('Too many sign-in attempts. Please try again later.');
    throw new Error('Unable to sign in. Please try again.');
  }
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('The server returned an invalid login session.');
  let expiresAt = typeof data.expiresIn === 'number' && data.expiresIn > 0
    ? Date.now() + data.expiresIn * 1000 : NaN;
  // JWT decoding is only for scheduling expiry. The API must verify the signature.
  try {
    const payload = data.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    if (typeof exp === 'number') expiresAt = Number.isFinite(expiresAt) ? Math.min(expiresAt, exp * 1000) : exp * 1000;
  } catch { /* Opaque tokens require expiresIn. */ }
  const session = { accessToken: data.accessToken, user: data.user, expiresAt };
  if (!isSession(session)) throw new Error('The server returned an invalid or expired login session.');
  return session;
}


function authUrl(path: string): string {
  const base = import.meta.env.VITE_AUTH_API_BASE_URL;

  if (!base) {
    throw new Error('Authentication API URL is not configured');
  }

  return `${base.replace(/\/$/, '')}${path}`;
}

export async function meRequest(session: Session, signal?: AbortSignal): Promise<User> {
  const response = await fetch(authUrl('/api/me'), {
    method: 'GET', headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
   signal, cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? 'Your session expired. Please sign in again.' : 'Unable to verify your session. Please try again.');
  const data = await response.json();
  const verified = { ...session, user: data?.user ?? data };
  if (!isSession(verified)) throw new Error('The server returned an invalid user session.');
  return verified.user;
}

export async function logoutRequest(session: Session | null): Promise<void> {
  const response = await fetch(authUrl('/api/logout'), {
    method: 'POST', headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
    cache: 'no-store', redirect: 'error',
  });
  if (!response.ok && response.status !== 401) throw new Error('Server logout failed. Please try again.');
}

export async function updateProfileRequest(session: Session, displayName: string, signal?: AbortSignal): Promise<User> {
  const name = displayName.trim();
  if (name.length < 2 || name.length > 100) throw new Error('Display name must be 2?100 characters.');
  const response = await fetch(authUrl('/api/updateProfile'), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name }), signal, cache: 'no-store', redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session expired. Please sign in again.');
    throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to update profile.');
  }
  const updated = { ...session, user: data?.user };
  if (data?.success !== true || !isSession(updated) || updated.user.id !== session.user.id) throw new Error('The server returned an invalid profile.');
  return updated.user;
}

export async function changePasswordRequest(session: Session, currentPassword: string, newPassword: string, signal?: AbortSignal): Promise<void> {
  if (!currentPassword.length || currentPassword.length > 1024 || newPassword.length < 12 || newPassword.length > 1024) {
    throw new Error('Provide your current password and a new password of 12-1024 characters.');
  }
  if (currentPassword === newPassword) throw new Error('New password must be different from your current password.');
  const response = await fetch(authUrl('/api/changePassword'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }), signal, cache: 'no-store', redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to change password.');
  }
  if (data?.success !== true) throw new Error('The server did not confirm the password change.');
}

export async function signupRequest(details: { username: string; name: string; password: string }): Promise<void> {
  const response = await fetch(authUrl('/api/signup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: details.username.trim(), name: details.name.trim(), password: details.password }),
    cache: 'no-store', redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to create account.');
  if (data?.success !== true) throw new Error('The server did not confirm registration.');
}
