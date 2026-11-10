import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { Maximize2, Minimize2, Pause, Play, RefreshCw } from 'lucide-react';
import { getHistoricalVoltage } from '../../services/voltageApi';
import type { VoltageReading } from '../../types/voltage';
import VoltageChart from './VoltageChart';

function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function DashboardGraph({ deviceId, mode, active, fullPage = false }: {
  deviceId: string; active: boolean; mode: 'realtime' | 'historical'; fullPage?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [minutes, setMinutes] = useState('30');
  const [paused, setPaused] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 24 * 60 * 60_000)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [plottedRange, setPlottedRange] = useState<{ from: string; to: string } | null>(null);
  const [readings, setReadings] = useState<VoltageReading[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(mode === 'realtime');
  const [updated, setUpdated] = useState('');
  const validRange = Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(to)) && Date.parse(from) < Date.parse(to);

  useEffect(() => {
    if (!active || (mode === 'realtime' && paused) || (mode === 'historical' && !range)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setLoading(true);
      const end = new Date();
      const selected = mode === 'historical' ? range! : {
        from: new Date(end.getTime() - Number(minutes) * 60_000).toISOString(), to: end.toISOString(),
      };
      try {
        const result = await getHistoricalVoltage(deviceId, selected.from, selected.to, controller.signal);
        if (!result.success) throw new Error('Unable to load readings.');
        if (!controller.signal.aborted) {
          setReadings(result.data ?? []); setPlottedRange(selected); setError('');
          setUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [deviceId, mode, minutes, paused, range, active, refresh]);

  return <Stack gap="sm">
    <Group className="curve-toolbar" justify="space-between" align="end">
      {mode === 'realtime' ? <Group gap="sm">
        <SegmentedControl size="xs" aria-label="Time window" value={minutes} onChange={value => {
          setMinutes(String(value)); setReadings([]); setPlottedRange(null); setUpdated(''); setError('');
        }} data={[{ label: '10 min', value: '10' }, { label: '30 min', value: '30' }, { label: '1 hour', value: '60' }]} />
        <Badge variant="dot" color={paused ? 'gray' : error ? 'red' : 'teal'}>{paused ? 'Paused' : error ? 'Offline' : 'Live · 10s'}</Badge>
      </Group> : <Group align="end" gap="sm">
        <TextInput size="xs" label="From" type="datetime-local" value={from} onChange={event => setFrom(event.currentTarget.value)} />
        <TextInput size="xs" label="To" type="datetime-local" value={to} onChange={event => setTo(event.currentTarget.value)} />
        <Button size="xs" loading={loading} disabled={!validRange} onClick={() => {
          setReadings([]); setError(''); setUpdated(''); setLoading(true);
          const selected = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
          setPlottedRange(selected); setRange(selected);
        }}>Apply</Button>
      </Group>}
      <Group gap={6}>
        {mode === 'realtime' && <>
          <Button size="xs" variant="default" leftSection={paused ? <Play size={13} /> : <Pause size={13} />} onClick={() => { setPaused(!paused); setLoading(false); }}>{paused ? 'Resume' : 'Pause'}</Button>
          <Button size="xs" variant="default" aria-label="Refresh chart" disabled={paused} loading={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={14} /></Button>
        </>}
        <Button size="xs" variant="default" leftSection={expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />} onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Expand'}</Button>
      </Group>
    </Group>
    {mode === 'historical' && !validRange && <Text c="red" size="xs">End time must be after start time.</Text>}
    {error && <Alert color="red" title="Could not refresh">{error}{readings.length > 0 ? ' Showing the last loaded readings.' : ''}</Alert>}
    <VoltageChart readings={readings} height={expanded ? 620 : fullPage ? 480 : 350}
      loading={loading} timeRange={plottedRange ?? (mode === 'historical' ? { from, to } : null)}
      emptyMessage={error ? 'Readings unavailable' : mode === 'historical' && !range ? 'Choose a period and apply' : 'No readings in this period'} />
    <Group justify="space-between" px={8}><Text size="xs" c="dimmed">{readings.length.toLocaleString()} readings</Text><Text size="xs" c="dimmed">{loading ? 'Updating…' : updated ? `Updated ${updated}` : ''}</Text></Group>
  </Stack>;
}
