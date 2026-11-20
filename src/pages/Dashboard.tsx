import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { Activity, History, Radio, Check } from 'lucide-react';
import { getAllDevices, getLatestVoltage } from '../services/voltageApi';
import type { BusbarDevice } from '../services/voltageApi';
import type { VoltageReading } from '../types/voltage';
import DashboardGraph from '../components/charts/DashboardGraph';
import './Dashboard.css';
import { formatVoltage, readingStatus, readingTime } from '../utils/telemetry';
import { useTelemetryClock } from '../hooks/useTelemetryClock';

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
        if (controller.signal.aborted) {
          return;
        }
        setDeviceList(available);
        setDeviceId((current) =>
          available.some((device) => device.deviceId === current)
            ? current
            : (available[0]?.deviceId ?? ''),
        );
        setListError('');
        setListLoading(false);
        await Promise.all(
          available.map(async (device) => {
            try {
              const result = await getLatestVoltage(device.deviceId, controller.signal);
              if (!result.success) {
                throw new Error('Unable to load this device.');
              }
              if (!controller.signal.aborted) {
                setDevices((current) => ({
                  ...current,
                  [device.deviceId]: { reading: result.data },
                }));
              }
            } catch (error) {
              if (!controller.signal.aborted) {
                setDevices((current) => ({
                  ...current,
                  [device.deviceId]: {
                    reading: current[device.deviceId]?.reading ?? null,
                    error: error instanceof Error ? error.message : 'Unable to load this device.',
                  },
                }));
              }
            }
          }),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setListError(error instanceof Error ? error.message : 'Unable to load devices.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setListLoading(false);
        }
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(() => void load(), 10_000);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const now = useTelemetryClock();

  return (
    <Stack gap={14} className="monitor-dashboard">
      <Group justify="space-between">
        <Title order={2}>Dashboard</Title>
        <Text size="sm" c="dimmed">
          {deviceList.length} {deviceList.length === 1 ? 'device' : 'devices'}
        </Text>
      </Group>
      <section aria-label="Devices">
        {listLoading && (
          <Group py="lg">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Loading devices...
            </Text>
          </Group>
        )}
        {listError && (
          <Alert color="red" title="Unable to load devices" mb="md">
            {listError} Retrying automatically.
          </Alert>
        )}
        {!listLoading && !listError && !deviceList.length && (
          <Paper className="dashboard-empty" withBorder>
            <Radio size={30} strokeWidth={1.4} />
            <Title order={4} mt="md">
              No enabled devices registered
            </Title>
          </Paper>
        )}
        <div className={`device-strip${deviceList.length > 1 ? ' device-strip-multiple' : ''}`}>
          {deviceList.map((device) => {
            const state = devices[device.deviceId];
            const reading = state?.reading;
            const selected = deviceId === device.deviceId;
            const status = readingStatus(reading?.receivedAt, now);
            const unavailable = Boolean(listError || state?.error);
            const isFresh = status.fresh && !unavailable;
            const statusLabel = unavailable ? 'Unavailable' : !state ? 'Checking' : status.label;
            return (
              <Card
                key={device.deviceId}
                withBorder
                padding="sm"
                radius="md"
                data-fresh={isFresh}
                className={`device-card ${selected ? 'device-card-selected' : ''}`}
              >
                <div className="device-row">
                  <div className="device-identity">
                    <Text size="sm" fw={600}>
                      Device {device.deviceId}
                    </Text>
                    <Badge size="sm" color={unavailable ? 'red' : status.color} variant="light">
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="device-voltage" aria-label="Current voltage">
                    {!state && !unavailable ? (
                      <Loader size="sm" />
                    ) : (
                      <strong>
                        {isFresh && reading ? formatVoltage(reading.voltage) : '—'} <span>mV</span>
                      </strong>
                    )}
                  </div>
                  <div className="last-reading">
                    <Text size="sm">
                      Last received:{' '}
                      <strong>{reading ? formatVoltage(reading.voltage) + ' mV' : '—'}</strong>
                    </Text>
                    <Text size="xs" c="dimmed">
                      {reading ? readingTime(reading.receivedAt) : 'No reading received'}
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    variant={selected ? 'subtle' : 'outline'}
                    leftSection={selected ? <Check size={14} /> : undefined}
                    aria-label={(selected ? 'Selected' : 'View') + ' device ' + device.deviceId}
                    aria-pressed={selected}
                    onClick={() => setDeviceId(device.deviceId)}
                  >
                    {selected ? 'Selected' : 'View'}
                  </Button>
                </div>
                {state?.error && (
                  <Text size="xs" c="red" mt="xs">
                    {state.error}
                  </Text>
                )}
              </Card>
            );
          })}
        </div>
      </section>
      <Paper withBorder p="md" radius="md" className="dashboard-graph">
        <Group justify="space-between" mb={8}>
          <Title order={4}>{deviceId ? `Device ${deviceId}` : 'Voltage'}</Title>
        </Group>
        <Tabs value={tab} onChange={setTab} keepMounted>
          <Tabs.List mb={10}>
            <Tabs.Tab value="realtime" leftSection={<Activity size={16} />}>
              Live trend
            </Tabs.Tab>
            <Tabs.Tab value="historical" leftSection={<History size={16} />}>
              History
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="realtime">
            {deviceId ? (
              <DashboardGraph
                key={`realtime-${deviceId}`}
                deviceId={deviceId}
                mode="realtime"
                active={tab === 'realtime'}
              />
            ) : (
              <GraphPlaceholder />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="historical">
            {deviceId ? (
              <DashboardGraph
                key={`historical-${deviceId}`}
                deviceId={deviceId}
                mode="historical"
                active={tab === 'historical'}
              />
            ) : (
              <GraphPlaceholder />
            )}
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}

function GraphPlaceholder() {
  return (
    <div className="dashboard-graph-empty">
      <div>
        <Activity size={28} strokeWidth={1.5} />
        <Text fw={600} mt="sm">
          No device selected
        </Text>
      </div>
    </div>
  );
}
