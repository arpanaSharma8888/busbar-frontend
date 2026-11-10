
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import RequireAuth from './components/RequireAuth';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RealtimeGraph from './pages/RealtimeGraph';
import HistoricalGraph from './pages/HistoricalGraph';
import TabularData from './pages/TabularData';
import MacIdManagement from './pages/MacIdManagement';
import EditProfile from './pages/EditProfile';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/realtime" element={<RealtimeGraph />} />
          <Route path="/historical" element={<HistoricalGraph />} />
          <Route path="/records" element={<TabularData />} />
          <Route path="/mac-ids" element={<MacIdManagement />} />
          <Route path="/profile" element={<EditProfile />} />
        </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
