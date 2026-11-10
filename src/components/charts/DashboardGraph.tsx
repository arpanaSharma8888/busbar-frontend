import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { getHistoricalVoltage } from '../../services/voltageApi';
import type { VoltageReading } from '../../types/voltage';
import VoltageChart from './VoltageChart';

function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function DashboardGraph({ deviceId, mode, active }: { deviceId: string; active: boolean; mode: 'realtime' | 'historical' }) {
  const [chartHeight, setChartHeight] = useState(() => Math.max(180, Math.min(360, window.innerHeight - 480)));
  useEffect(() => {
    const resize = () => setChartHeight(Math.max(180, Math.min(360, window.innerHeight - 480)));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [minutes, setMinutes] = useState('30');
  const [paused, setPaused] = useState(false);
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 24 * 60 * 60_000)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [readings, setReadings] = useState<VoltageReading[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(mode === 'realtime');
  const [updated, setUpdated] = useState('');
  const validRange = Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(to)) && Date.parse(from) < Date.parse(to);

  useEffect(() => {
    if ((mode === 'realtime' && (paused || !active)) || (mode === 'historical' && !range)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setLoading(true);
      const end = new Date();
      try {
        const result = await getHistoricalVoltage(deviceId,
          mode === 'historical' ? range!.from : new Date(end.getTime() - Number(minutes) * 60_000).toISOString(),
          mode === 'historical' ? range!.to : end.toISOString(), controller.signal);
        if (!result.success) throw new Error('Unable to load voltage readings.');
        if (!controller.signal.aborted) {
          setReadings(result.data ?? []); setError(''); setUpdated(new Date().toLocaleTimeString());
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load readings.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (mode === 'realtime') timer = setTimeout(() => void load(), 10_000);
        }
      }
    };
    timer = setTimeout(() => void load(), 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [deviceId, mode, minutes, paused, range, active]);

  return <Stack gap={8}>
    {mode === 'realtime' ? <Group className="curve-toolbar" justify="space-between">
      <SegmentedControl size="xs" aria-label="Realtime time window" value={minutes} onChange={value => { setMinutes(String(value)); setReadings([]); }} data={[{ label: '10 min', value: '10' }, { label: '15 min', value: '15' }, { label: '30 min', value: '30' }]} />
      <Group><Badge color={paused ? 'yellow' : 'blue'}>{paused ? 'Paused' : 'Refreshes every 10 seconds'}</Badge><Button size="xs" variant="light" onClick={() => { setPaused(!paused); setLoading(false); }}>{paused ? 'Resume' : 'Pause'}</Button></Group>
    </Group> : <Group className="curve-toolbar" align="end">
      <TextInput size="xs" label="From" type="datetime-local" value={from} onChange={event => setFrom(event.currentTarget.value)} />
      <TextInput size="xs" label="To" type="datetime-local" value={to} onChange={event => setTo(event.currentTarget.value)} />
      <Button size="xs" loading={loading} disabled={!validRange} onClick={() => { setReadings([]); setError(''); setLoading(true); setRange({ from: new Date(from).toISOString(), to: new Date(to).toISOString() }); }}>Load history</Button>
    </Group>}
    {mode === 'historical' && !validRange && <Text c="red" size="sm">Choose a valid date range with From earlier than To.</Text>}
    {error && <Alert color="red" title="Unable to refresh graph">{error}</Alert>}
    <VoltageChart readings={readings} height={chartHeight} title="" />
    <Group justify="space-between"><Text size="xs" c="dimmed">{loading ? 'Loading readings...' : `${readings.length} readings displayed`}</Text>{updated && <Text size="xs" c="dimmed">Last updated: {updated}</Text>}</Group>
    <div className="curve-message">{!loading && !readings.length && !error && <Text ta="center" c="dimmed" size="sm">{mode === 'historical' && !range ? 'Choose a date range and select Load history.' : 'No readings available for this device and time range.'}</Text>}</div>
  </Stack>;
}
