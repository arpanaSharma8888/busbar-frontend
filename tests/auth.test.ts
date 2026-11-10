import { beforeEach, expect, test, vi } from 'vitest';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}
const payload = () => ({ accessToken: 'opaque-token', expiresIn: 3600, user: { id: '1', username: 'operator' } });
const credentials = { username: ' operator ', password: 'secret', remember: false };

beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal('window', { localStorage: storage(), sessionStorage: storage() });
  vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example');
  vi.stubEnv('VITE_AUTH_API_BASE_URL', 'http://localhost:7071');
});

test('login posts credentials, stores session without password and logout clears it', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload()));
  vi.stubGlobal('fetch', fetchMock);
  const { store } = await import('../src/store');
  const { login, logout } = await import('../src/store/userSlice');
  await store.dispatch(login(credentials));
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7071/api/login');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ username: 'operator', password: 'secret' });
  expect(store.getState().user.status).toBe('authenticated');
  expect(window.sessionStorage.getItem('busbar.session')).toContain('opaque-token');
  expect(window.sessionStorage.getItem('busbar.session')).not.toContain('secret');
  expect(window.localStorage.getItem('busbar.session')).toBeNull();
  store.dispatch(logout());
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:7071/api/logout');
  expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  expect(store.getState().user.session).toBeNull();
  expect(window.sessionStorage.getItem('busbar.session')).toBeNull();
});

test('remember me persists and restores a valid session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload())));
  const { store } = await import('../src/store');
  const { login } = await import('../src/store/userSlice');
  await store.dispatch(login({ ...credentials, remember: true }));
  expect(window.localStorage.getItem('busbar.session')).toContain('opaque-token');
  vi.resetModules();
  const restored = await import('../src/store');
  expect(restored.store.getState().user.status).toBe('authenticated');
});

test.each([null, { ...payload(), expiresIn: -1 }, { ...payload(), user: {} }])('rejects malformed or expired login response %j', async body => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
  const { store } = await import('../src/store');
  const { login } = await import('../src/store/userSlice');
  await store.dispatch(login(credentials));
  expect(store.getState().user.session).toBeNull();
  expect(store.getState().user.error).toBeTruthy();
});

test('invalid credentials expose a useful error and no session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  const { store } = await import('../src/store');
  const { login } = await import('../src/store/userSlice');
  await store.dispatch(login(credentials));
  expect(store.getState().user.error).toBe('Invalid username or password.');
  expect(store.getState().user.session).toBeNull();
});

test('API sends bearer token and a 401 clears the session', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload())).mockResolvedValueOnce(new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
  const { store } = await import('../src/store');
  const { login } = await import('../src/store/userSlice');
  const { authenticatedFetch } = await import('../src/services/apiClient');
  await store.dispatch(login(credentials));
  await expect(authenticatedFetch('/api/getLatestVoltage')).rejects.toThrow('session expired');
  expect(fetchMock.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer opaque-token');
  expect(store.getState().user.session).toBeNull();
  expect(window.sessionStorage.getItem('busbar.session')).toBeNull();
});

test('expired stored tokens cannot authorize requests', async () => {
  window.localStorage.setItem('busbar.session', JSON.stringify({ ...payload(), expiresAt: Date.now() - 1 }));
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { authenticatedFetch } = await import('../src/services/apiClient');
  await expect(authenticatedFetch('/api/getLatestVoltage')).rejects.toThrow('sign in');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(window.localStorage.getItem('busbar.session')).toBeNull();
});

test('logout during login prevents a late response from restoring the session', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockResolvedValue(new Response(null, { status: 204 })));
  const { store } = await import('../src/store');
  const { login, logout } = await import('../src/store/userSlice');
  const pending = store.dispatch(login(credentials));
  store.dispatch(logout());
  resolve(Response.json(payload()));
  await pending;
  expect(store.getState().user.session).toBeNull();
  expect(window.sessionStorage.getItem('busbar.session')).toBeNull();
});


test('me checks the stored token and clears a rejected session', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload()))
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
  const { store } = await import('../src/store');
  const { login, verifySession } = await import('../src/store/userSlice');
  await store.dispatch(login(credentials));
  await store.dispatch(verifySession(store.getState().user.session!));
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:7071/api/me');
  expect(fetchMock.mock.calls[1][1].method).toBe('GET');
  expect(store.getState().user.session).toBeNull();
  expect(window.sessionStorage.getItem('busbar.session')).toBeNull();
});


test('password change clears persisted session without sending obsolete logout token', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload()));
  vi.stubGlobal('fetch', fetchMock);
  const { store } = await import('../src/store');
  const { login, passwordChanged } = await import('../src/store/userSlice');
  await store.dispatch(login({ ...credentials, remember: true }));
  store.dispatch(passwordChanged());
  expect(store.getState().user.session).toBeNull();
  expect(window.localStorage.getItem('busbar.session')).toBeNull();
  expect(window.sessionStorage.getItem('busbar.session')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
