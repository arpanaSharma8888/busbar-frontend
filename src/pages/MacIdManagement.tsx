import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { RefreshCw, Search } from 'lucide-react';
import { getAllDevices } from '../services/voltageApi';
import type { BusbarDevice } from '../services/voltageApi';

export default function MacIdManagement() {
  const [search, setSearch] = useState('');
  const [devices, setDevices] = useState<BusbarDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const result = await getAllDevices(controller.signal);
      if (!controller.signal.aborted) setDevices(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load MAC addresses.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [load]);

  const query = search.trim().toLowerCase();
  const filtered = devices.filter(device => device.deviceId.toLowerCase().includes(query) || (device.macId ?? '').toLowerCase().includes(query));

  return <Stack gap="md">
    <Group justify="space-between">
      <Title order={2}>Devices</Title>
      <Badge variant="light">{devices.length} devices</Badge>
    </Group>
    {error && <Alert color="red" title="Unable to refresh devices">{error}{devices.length > 0 && ' Previously loaded devices are shown below.'}</Alert>}
    <Paper withBorder p="md" radius="md" aria-busy={loading}>
      <Group justify="space-between" align="end" mb="md">
        <TextInput label="Search devices" placeholder="Device ID or MAC address" leftSection={<Search size={16} />} value={search} onChange={event => setSearch(event.currentTarget.value)} />
        <Button variant="light" leftSection={<RefreshCw size={16} />} loading={loading} onClick={() => void load()}>Refresh</Button>
      </Group>
      <Table.ScrollContainer minWidth={450}>
        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead><Table.Tr><Table.Th>Device ID</Table.Th><Table.Th>MAC address</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {filtered.map(device => <Table.Tr key={device.deviceId}><Table.Td>{device.deviceId}</Table.Td><Table.Td><Text size="sm" ff="monospace">{device.macId || 'Not available'}</Text></Table.Td></Table.Tr>)}
            {!filtered.length && <Table.Tr><Table.Td colSpan={2}><Text ta="center" c="dimmed" py="xl">{loading ? 'Loading devices...' : error && !devices.length ? 'Unable to load devices. Use Refresh to try again.' : devices.length ? 'No devices match your search.' : 'No devices returned by the API.'}</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt="md">Showing {filtered.length} of {devices.length} devices</Text>
    </Paper>
  </Stack>;
}
