
import { NavLink, Stack } from '@mantine/core';
import {
  LayoutDashboard,
  Activity,
  ChartNoAxesCombined,
  Table2,
  Cpu,
  UserRound,
} from 'lucide-react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';

const links = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Live voltage', path: '/realtime', icon: Activity },
  { label: 'History', path: '/historical', icon: ChartNoAxesCombined },
  { label: 'Records', path: '/records', icon: Table2 },
  { label: 'Devices', path: '/mac-ids', icon: Cpu },
  { label: 'Profile', path: '/profile', icon: UserRound },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <Stack gap="md">
      <Stack gap={6} px="sm" py="lg">
        {links.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            component={RouterNavLink}
            to={path}
            label={label}
            leftSection={<Icon size={18} />}
            active={location.pathname === path}
            variant="light"
            color="blue"
            style={{ borderRadius: 8 }}
          />
        ))}
      </Stack>
    </Stack>
  );
}
