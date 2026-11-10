
import {
  ActionIcon,
  Avatar,
  Group,
  Text,
  useMantineColorScheme,
} from '@mantine/core';
import { Moon, Sun, LogOut } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/userSlice';

export default function Header() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.user.session?.user);
  const displayName = user?.name || user?.username || 'User';

  return (
    <Group justify="space-between" h="100%" px="lg">
      <div>
        <Text fw={600}>Busbar Voltage Monitoring</Text>
        <Text size="xs" c="dimmed">Industrial Monitoring Dashboard</Text>
      </div>

      <Group gap="md">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          onClick={toggleColorScheme}
          aria-label="Toggle theme"
        >
          {colorScheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </ActionIcon>

        <Group gap="xs">
          <Avatar color="blue" radius="xl" size="sm">
            {displayName.charAt(0).toUpperCase()}
          </Avatar>
          <Text size="sm" fw={500}>{displayName}</Text>
        </Group>

        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          aria-label="Logout"
          onClick={() => dispatch(logout())}
          title="Sign out"
        >
          <LogOut size={19} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
