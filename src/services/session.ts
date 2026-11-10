export interface User {
  id: string | number;
  username: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface Session {
  accessToken: string;
  user: User;
  expiresAt: number;
}

export const SESSION_KEY = 'busbar.session';

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const session = value as Session;
  return typeof session.accessToken === 'string' && !!session.accessToken.trim()
    && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()
    && !!session.user && typeof session.user.username === 'string'
    && !!session.user.username.trim()
    && ['string', 'number'].includes(typeof session.user.id)
    && ['name', 'email', 'role'].every(key => {
      const field = session.user[key as keyof User];
      return field === undefined || typeof field === 'string';
    });
}

export function clearSession() {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try { window[storage].removeItem(SESSION_KEY); } catch { /* Storage may be blocked. */ }
  }
}

export function readSession(): Session | null {
  for (const storage of ['sessionStorage', 'localStorage'] as const) {
    try {
      const raw = window[storage].getItem(SESSION_KEY);
      if (!raw) continue;
      const session: unknown = JSON.parse(raw);
      if (isSession(session)) return session;
      window[storage].removeItem(SESSION_KEY);
    } catch { /* Invalid or unavailable storage must not prevent login. */ }
  }
  return null;
}

export function saveSession(session: Session, remember: boolean) {
  clearSession();
  try {
    window[remember ? 'localStorage' : 'sessionStorage'].setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* The in-memory session still works when storage is unavailable. */ }
}
