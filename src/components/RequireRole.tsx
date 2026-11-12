import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';

export default function RequireRole({ role }: { role: 'admin' | 'viewer' }) {
  const userRole = useAppSelector(state => state.user.session?.user.role);
  return userRole === role ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
