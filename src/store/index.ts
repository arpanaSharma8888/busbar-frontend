import { logoutRequest } from '../services/authApi';
import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import userReducer, { passwordChanged, profileUpdated, login, logout, logoutFailed, verifySession, sessionExpired } from './userSlice';
import { clearSession, readSession, saveSession, SESSION_KEY } from '../services/session';

const session = readSession();
const listener = createListenerMiddleware();
export const store = configureStore({
  reducer: { user: userReducer },
  preloadedState: { user: { session, status: session ? 'authenticated' as const : 'idle' as const, error: null } },
  middleware: getDefaultMiddleware => getDefaultMiddleware().prepend(listener.middleware),
  // Login actions contain credentials; do not expose them to the DevTools extension.
  devTools: false,
});

listener.startListening({
  matcher: isAnyOf(passwordChanged, login.fulfilled, logout, sessionExpired, verifySession.rejected),
  effect: async (action, api) => {
    const previousSession = (api.getOriginalState() as { user: { session: typeof session } }).user.session;
    if (login.fulfilled.match(action)) {
      if (store.getState().user.session === action.payload) saveSession(action.payload, action.meta.arg.remember);
    } else if (!store.getState().user.session) clearSession();
    if (logout.match(action)) {
      try { await logoutRequest(previousSession); }
      catch (error) { store.dispatch(logoutFailed(error instanceof Error ? error.message : 'Server logout failed.')); }
    }
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

listener.startListening({
  actionCreator: profileUpdated,
  effect: (_, api) => {
    const current = (api.getState() as RootState).user.session;
    if (!current) return;
    for (const location of ['localStorage', 'sessionStorage'] as const) {
      try {
        const raw = window[location].getItem(SESSION_KEY);
        if (raw && JSON.parse(raw).accessToken === current.accessToken) window[location].setItem(SESSION_KEY, JSON.stringify(current));
      } catch { /* Keep the in-memory profile when storage is unavailable. */ }
    }
  },
});
