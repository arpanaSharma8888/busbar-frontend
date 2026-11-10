import { useEffect, useState } from 'react';
import { Alert, Group, Paper, Select, Stack, Title } from '@mantine/core';
import { getAllDevices } from '../../services/voltageApi';
import type { BusbarDevice } from '../../services/voltageApi';
import DashboardGraph from './DashboardGraph';
import VoltageChart from './VoltageChart';

export default function GraphPage({ mode }: { mode: 'realtime' | 'historical' }) {
  const [devices, setDevices] = useState<BusbarDevice[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getAllDevices(controller.signal).then(list => {
      if (!controller.signal.aborted) { setDevices(list); setDeviceId(list[0]?.deviceId ?? ''); }
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load devices.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <Stack gap="md">
    <Group justify="space-between"><Title order={2}>{mode === 'realtime' ? 'Live voltage' : 'History'}</Title>
      <Select aria-label="Device" placeholder={loading ? 'Loading devices…' : 'Select device'} w={190}
        data={devices.map(device => ({ value: device.deviceId, label: `Device ${device.deviceId}` }))}
        value={deviceId || null} allowDeselect={false} onChange={value => { if (value) setDeviceId(value); }} />
    </Group>
    {error && <Alert color="red" title="Could not load devices">{error}</Alert>}
    <Paper withBorder p="md" radius="md">
      {deviceId ? <DashboardGraph key={`${mode}-${deviceId}`} mode={mode} deviceId={deviceId} active fullPage />
        : <VoltageChart readings={[]} loading={loading} height={480} emptyMessage={error ? 'Devices unavailable' : 'No devices connected'} />}
    </Paper>
  </Stack>;
}
