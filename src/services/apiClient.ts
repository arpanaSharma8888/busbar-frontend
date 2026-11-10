import { store } from '../store';
import { sessionExpired } from '../store/userSlice';
import { apiUrl } from './authApi';

export async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const session = store.getState().user.session;
  if (!session || session.expiresAt <= Date.now()) {
    store.dispatch(sessionExpired());
    throw new Error('Please sign in to continue.');
  }
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  const response = await fetch(apiUrl(path), { ...options, headers, cache: 'no-store', redirect: 'error' });
  if (response.status === 401) {
    // An old request must not clear a newer login session.
    if (store.getState().user.session === session) store.dispatch(sessionExpired());
    throw new Error('Your session expired. Please sign in again.');
  }
  return response;
}
