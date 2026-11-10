
import { AppShell, Burger, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router-dom';

import Sidebar from './layout/Sidebar';
import Header from './layout/Header';

export default function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 70 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
            ml="md"
          />
          <div style={{ flex: 1 }}>
            <Header />
          </div>
        </div>
      </AppShell.Header>

      <AppShell.Navbar>
        <ScrollArea>
          <div onClick={close}>
            <Sidebar />
          </div>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
