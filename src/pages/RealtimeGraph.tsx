
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Pause, Play, RefreshCw } from 'lucide-react';
import VoltageChart from '../components/charts/VoltageChart';
import { getHistoricalVoltage } from '../services/voltageApi';
import type { VoltageReading } from '../types/voltage';

const DEVICES = [
  { value: '1', label: 'Controller 1' },
  { value: '2', label: 'Controller 2' },
  { value: '3', label: 'Controller 3' },
];

export default function RealtimeGraph() {
  const [deviceId, setDeviceId] = useState('1');
  const [windowMinutes, setWindowMinutes] = useState('30');
  const [paused, setPaused] = useState(false);
  const [readings, setReadings] = useState<VoltageReading[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchReadings = useCallback(
    async (signal?: AbortSignal) => {
      const to = new Date();
      const from = new Date(
        to.getTime() - Number(windowMinutes) * 60_000
      );

      setLoading(true);

      try {
        const result = await getHistoricalVoltage(
          deviceId,
          from.toISOString(),
          to.toISOString(),
          signal
        );

        if (signal?.aborted) return;

        setReadings(result.data ?? []);
        setError('');
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        if (signal?.aborted) return;

        setError(
          err instanceof Error ? err.message : 'Unable to load data'
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [deviceId, windowMinutes]
  );

  useEffect(() => {
    if (paused) return;

    const controller = new AbortController();

    const initialFetch = window.setTimeout(() => void fetchReadings(controller.signal), 0);

    const timer = window.setInterval(() => {
      void fetchReadings(controller.signal);
    }, 10_000);

    return () => {
      controller.abort();
      window.clearTimeout(initialFetch);
      window.clearInterval(timer);
    };
  }, [fetchReadings, paused]);

  const visibleReadings = useMemo(() => readings, [readings]);

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Realtime Voltage Graph</Title>
          <Text c="dimmed" size="sm">
            Live voltage monitoring by controller
          </Text>
        </div>
        <Badge color={paused ? 'yellow' : 'green'}>
          {paused ? 'Paused' : 'Live'}
        </Badge>
      </Group>

      <Paper withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="end">
            <Select
              label="Controller"
              data={DEVICES}
              value={deviceId}
              onChange={(value) => {
                if (value) {
                  setDeviceId(value);
                  setReadings([]);
                }
              }}
              w={190}
              allowDeselect={false}
            />

            <SegmentedControl
              value={windowMinutes}
              onChange={(value) => setWindowMinutes(String(value))}
              data={[
                { label: '10 min', value: '10' },
                { label: '15 min', value: '15' },
                { label: '30 min', value: '30' },
              ]}
            />

            <Group gap="xs">
              <Button
                variant="light"
                leftSection={
                  paused ? <Play size={16} /> : <Pause size={16} />
                }
                onClick={() => setPaused((current) => !current)}
              >
                {paused ? 'Resume' : 'Pause'}
              </Button>

              <Button
                variant="default"
                leftSection={<RefreshCw size={16} />}
                onClick={() => void fetchReadings()}
                loading={loading}
              >
                Refresh
              </Button>
            </Group>
          </Group>

          {error && (
            <Alert color="red" title="Unable to load readings">
              {error}
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            {[
              ['Latest voltage', visibleReadings.length ? `${visibleReadings.reduce((latest, item) => Date.parse(item.receivedAt) > Date.parse(latest.receivedAt) ? item : latest).voltage.toFixed(3)} V` : '--'],
              ['Controller', `Controller ${deviceId}`],
              ['Time window', `${windowMinutes} minutes`],
            ].map(([label, value]) => <Paper key={label} withBorder p="md"><Text size="sm" c="dimmed">{label}</Text><Text fw={600}>{value}</Text></Paper>)}
          </SimpleGrid>
          <VoltageChart readings={visibleReadings} height={400} />
          {!loading && !visibleReadings.length && <Text ta="center" size="sm" c="dimmed">No voltage readings available for this controller and time window.</Text>}

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {visibleReadings.length} readings displayed
            </Text>
            <Text size="xs" c="dimmed">
              Last updated: {lastUpdated ?? 'Not yet'}
            </Text>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}


