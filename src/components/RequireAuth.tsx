import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { verifySession, sessionExpired } from '../store/userSlice';
import { SESSION_KEY } from '../services/session';

export default function RequireAuth() {
  const session = useAppSelector(state => state.user.session);
  const dispatch = useAppDispatch();
  const location = useLocation();

  useEffect(() => {
    if (!session) return;
    const request = dispatch(verifySession(session));
    return () => request.abort();
  }, [session, dispatch]);

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      clearTimeout(timer);
      const remaining = session.expiresAt - Date.now();
      if (remaining <= 0) dispatch(sessionExpired());
      else timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    };
    const syncLogout = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === null || (event.key === SESSION_KEY && event.newValue === null))) dispatch(sessionExpired());
    };
    checkExpiry();
    window.addEventListener('focus', checkExpiry);
    window.addEventListener('storage', syncLogout);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', checkExpiry);
      window.removeEventListener('storage', syncLogout);
    };
  }, [session, dispatch]);

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />;
  }
  return <Outlet />;
}
