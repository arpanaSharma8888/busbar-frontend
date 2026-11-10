
import { NavLink, Stack, Text, Group, ThemeIcon } from '@mantine/core';
import {
  LayoutDashboard,
  Activity,
  ChartNoAxesCombined,
  Table2,
  Cpu,
  UserRound,
  Zap,
} from 'lucide-react';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';

const links = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Realtime Graph', path: '/realtime', icon: Activity },
  { label: 'Historical Graph', path: '/historical', icon: ChartNoAxesCombined },
  { label: 'Tabular Data', path: '/records', icon: Table2 },
  { label: 'MAC ID Management', path: '/mac-ids', icon: Cpu },
  { label: 'Edit Profile', path: '/profile', icon: UserRound },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <Stack gap="md">
      <Group px="md" py="lg" gap="sm">
        <ThemeIcon size={38} radius="md" variant="light">
          <Zap size={22} />
        </ThemeIcon>
        <div>
          <Text fw={700} size="sm">Busbar Monitoring</Text>
          <Text size="xs" c="dimmed">
            Voltage Monitoring System
          </Text>
        </div>
      </Group>

      <Stack gap={4} px="sm">
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
