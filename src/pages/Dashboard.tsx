import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, NumberFormatter, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { Activity, History, Zap, Radio, ArrowUpRight } from 'lucide-react';
import { getAllDevices, getLatestVoltage } from '../services/voltageApi';
import type { BusbarDevice } from '../services/voltageApi';
import type { VoltageReading } from '../types/voltage';
import DashboardGraph from '../components/charts/DashboardGraph';
import './Dashboard.css';

type DeviceState = { reading: VoltageReading | null; error?: string };

export default function Dashboard() {
  const [deviceId, setDeviceId] = useState('');
  const [tab, setTab] = useState<string | null>('realtime');
  const [devices, setDevices] = useState<Record<string, DeviceState>>({});

  const [deviceList, setDeviceList] = useState<BusbarDevice[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const available = await getAllDevices(controller.signal);
        if (controller.signal.aborted) return;
        setDeviceList(available);
        setDeviceId(current => available.some(device => device.deviceId === current) ? current : available[0]?.deviceId ?? '');
        setListError('');
        setListLoading(false);
        await Promise.all(available.map(async device => {
        try {
          const result = await getLatestVoltage(device.deviceId, controller.signal);
          if (!result.success) throw new Error('Unable to load this device.');
          if (!controller.signal.aborted) setDevices(current => ({ ...current, [device.deviceId]: { reading: result.data } }));
        } catch (error) {
          if (!controller.signal.aborted) setDevices(current => ({ ...current, [device.deviceId]: {
            reading: current[device.deviceId]?.reading ?? null,
            error: error instanceof Error ? error.message : 'Unable to load this device.',
          } }));
        }
        }));
      } catch (error) {
        if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : 'Unable to load devices.');
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void load(), 10_000);
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  return (
    <Stack gap={14} className="monitor-dashboard">
      <Group justify="space-between" align="end">
        <div><Text className="dashboard-eyebrow">BUS BAR / MONITORING</Text><Title order={2} className="dashboard-title">Device overview</Title></div>
        <Badge size="lg" variant="light" color="blue">{deviceList.length} devices</Badge>
      </Group>
      <section aria-label="Devices">
      <Group justify="space-between" mb={8}><Text size="sm" fw={600}>Devices</Text><Text size="xs" c="dimmed">Select a device to view its curve</Text></Group>
      {listLoading && <Group py="lg"><Loader size="sm" /><Text size="sm" c="dimmed">Loading devices...</Text></Group>}
      {listError && <Alert color="red" title="Unable to load devices" mb="md">{listError} Retrying automatically.</Alert>}
      {!listLoading && !listError && !deviceList.length && <Paper className="dashboard-empty" withBorder><Radio size={30} strokeWidth={1.4} /><Title order={4} mt="md">No devices connected</Title><Text size="sm" c="dimmed" mt={6}>No devices were returned by the voltage API.</Text></Paper>}
      <div className="device-strip">
        {deviceList.map(device => {
          const state = devices[device.deviceId];
          const reading = state?.reading;
          const selected = deviceId === device.deviceId;
          return <Card key={device.deviceId} withBorder padding="sm" radius="md" className={`device-card ${selected ? 'device-card-selected' : ''}`}>
            <Stack gap={6}>
              <Group justify="space-between"><Text size="sm" fw={600} truncate title={`Device ${device.deviceId}`}>Device {device.deviceId}</Text><Badge size="xs" color={state?.error ? 'red' : 'gray'} variant="light">{state?.error ? 'Unavailable' : !state ? 'Loading' : reading ? 'Available' : 'No data'}</Badge></Group>
              <Group gap="xs" className="device-voltage"><Zap size={16} /><Title order={2}>{!state ? <Loader size="sm" /> : reading ? <NumberFormatter value={reading.voltage} decimalScale={3} suffix=" V" fixedDecimalScale /> : '--'}</Title></Group>
              <Text size="xs" c="dimmed" truncate>MAC: {reading?.macId ?? device.macId ?? '--'}</Text>
              <Text size="xs" c="dimmed">Received: {reading?.receivedAt ? new Date(reading.receivedAt).toLocaleString() : '--'}</Text>
              {state?.error && <Alert color="red" title="Unable to refresh">{state.error}</Alert>}
              <Button size="compact-xs" fullWidth justify="space-between" rightSection={<ArrowUpRight size={16} />} variant={selected ? 'light' : 'subtle'} aria-pressed={selected} onClick={() => setDeviceId(device.deviceId)}>{selected ? 'Selected device' : 'View graph'}</Button>
            </Stack>
          </Card>;
        })}
      </div>
      </section>
      <Paper withBorder p="md" radius="md" className="dashboard-graph">
        <Group justify="space-between" mb={8}><Title order={4}>Voltage trend</Title>{deviceId && <Badge variant="light">Device {deviceId}</Badge>}</Group>
        <Tabs variant="pills" value={tab} onChange={setTab} keepMounted>
          <Tabs.List mb={10}>
            <Tabs.Tab value="realtime" leftSection={<Activity size={16} />}>Realtime curve</Tabs.Tab>
            <Tabs.Tab value="historical" leftSection={<History size={16} />}>Historical curve</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="realtime">{deviceId ? <DashboardGraph key={`realtime-${deviceId}`} deviceId={deviceId} mode="realtime" active={tab === 'realtime'} /> : <GraphPlaceholder />}</Tabs.Panel>
          <Tabs.Panel value="historical">{deviceId ? <DashboardGraph key={`historical-${deviceId}`} deviceId={deviceId} mode="historical" active={tab === 'historical'} /> : <GraphPlaceholder />}</Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}

function GraphPlaceholder() {
  return <div className="dashboard-graph-empty"><div><Activity size={28} strokeWidth={1.5} /><Text fw={600} mt="sm">Waiting for a device</Text><Text size="sm" c="dimmed" mt={4}>Select a connected device to explore voltage over time.</Text></div></div>;
}
