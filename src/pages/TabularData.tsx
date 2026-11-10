import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { Download, Search } from 'lucide-react';
import { getAllDevices, getHistoricalVoltage } from '../services/voltageApi';
import type { BusbarDevice } from '../services/voltageApi';
import type { VoltageReading } from '../types/voltage';

function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const ALL = '__all_devices__';

export default function TabularData() {
  const [devices, setDevices] = useState<BusbarDevice[]>([]);
  const [deviceId, setDeviceId] = useState(ALL);
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 24 * 60 * 60_000)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [rows, setRows] = useState<VoltageReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedRange, setLoadedRange] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('25');
  const request = useRef<AbortController | null>(null);
  const initialRange = useRef({ from, to });
  const validRange = Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(to)) && Date.parse(from) < Date.parse(to);

  const load = useCallback(async (selected: string, start: string, end: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(''); setRows([]); setPage(1); setLoadedRange('');
    try {
      const available = await getAllDevices(controller.signal);
      if (controller.signal.aborted) return;
      setDevices(available);
      const targets = selected === ALL ? available : available.filter(device => device.deviceId === selected);
      if (selected !== ALL && !targets.length) throw new Error('This device is no longer available. Select another device.');
      const results = await Promise.allSettled(targets.map(async device => {
        const result = await getHistoricalVoltage(device.deviceId, new Date(start).toISOString(), new Date(end).toISOString(), controller.signal);
        if (!result.success || !Array.isArray(result.data)) throw new Error('Invalid historical response');
        return result.data;
      }));
      if (controller.signal.aborted) return;
      const readings: VoltageReading[] = [];
      const failed: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') readings.push(...result.value);
        else failed.push(`${targets[index].deviceId}: ${result.reason instanceof Error ? result.reason.message : 'Request failed'}`);
      });
      setRows(readings.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)));
      if (failed.length) setError(`Some device readings could not be loaded. ${failed.join('; ')}`);
      setLoadedRange(`${selected === ALL ? 'All devices' : `Device ${selected}`} ? ${new Date(start).toLocaleString()} ? ${new Date(end).toLocaleString()}`);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load records.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(ALL, initialRange.current.from, initialRange.current.to), 0);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(rows.length / Number(pageSize)));
  const visible = rows.slice((page - 1) * Number(pageSize), page * Number(pageSize));
  const exportCsv = () => {
    const cell = (value: unknown) => {
      const text = String(value ?? '');
      return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
    };
    const csv = [['Device ID', 'MAC address', 'Received at', 'Voltage (V)'], ...rows.map(row => [row.deviceId, row.macId, row.receivedAt, row.voltage])]
      .map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'voltage-records.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <Stack gap="md">
    <Group justify="space-between"><div><Title order={2}>Tabular Data</Title><Text size="sm" c="dimmed">Voltage readings by device and timestamp</Text></div><Badge variant="light">{rows.length} readings</Badge></Group>
    <Paper withBorder p="md" radius="md">
      <form onSubmit={event => { event.preventDefault(); if (validRange) void load(deviceId, from, to); }}>
        <Group align="end">
          <Select label="Device" data={[{ value: ALL, label: 'All devices' }, ...devices.map(device => ({ value: device.deviceId, label: `Device ${device.deviceId}` }))]} value={deviceId} onChange={value => { if (value) setDeviceId(value); }} allowDeselect={false} searchable />
          <TextInput label="From" type="datetime-local" value={from} onChange={event => setFrom(event.currentTarget.value)} required />
          <TextInput label="To" type="datetime-local" value={to} onChange={event => setTo(event.currentTarget.value)} required />
          <Button type="submit" loading={loading} disabled={!validRange} leftSection={<Search size={16} />}>Load records</Button>
          <Button disabled={loading || !rows.length} variant="light" leftSection={<Download size={16} />} onClick={exportCsv}>Export CSV</Button>
        </Group>
      </form>
      {!validRange && <Text size="sm" c="red" mt="sm">Choose a valid date range with From earlier than To.</Text>}
    </Paper>
    {error && <Alert color="red" title="Unable to load all records">{error}</Alert>}
    <Paper withBorder p="md" radius="md" aria-busy={loading}>
      <Group justify="space-between" mb="md"><Title order={4}>Voltage records</Title><Text size="xs" c="dimmed">{loadedRange || 'Last 24 hours'}</Text></Group>
      <Table.ScrollContainer minWidth={650}><Table striped highlightOnHover>
        <Table.Thead><Table.Tr>{['Device', 'MAC address', 'Date & time', 'Voltage (V)'].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
        <Table.Tbody>
          {visible.map((row, index) => <Table.Tr key={`${row.deviceId}-${row.receivedAt}-${index}`}><Table.Td>{row.deviceId}</Table.Td><Table.Td>{row.macId || '--'}</Table.Td><Table.Td>{new Date(row.receivedAt).toLocaleString()}</Table.Td><Table.Td>{Number(row.voltage).toFixed(3)}</Table.Td></Table.Tr>)}
          {!visible.length && <Table.Tr><Table.Td colSpan={4}><Text ta="center" py="xl" c="dimmed">{loading ? 'Loading voltage records...' : error ? 'Records could not be loaded. Check the error above and retry.' : !devices.length ? 'No devices available.' : 'No readings found for this period. Try an earlier date range.'}</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table></Table.ScrollContainer>
      <Group justify="space-between" mt="md"><Select label="Rows per page" data={['25', '50', '100']} value={pageSize} onChange={value => { if (value) { setPageSize(value); setPage(1); } }} w={130} allowDeselect={false} /><Group><Button variant="default" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button><Text size="sm">Page {page} of {pageCount}</Text><Button variant="default" disabled={page >= pageCount || loading} onClick={() => setPage(page + 1)}>Next</Button></Group></Group>
    </Paper>
  </Stack>;
}
