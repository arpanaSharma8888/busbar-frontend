
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  CopyButton,
} from '@mantine/core';
import { Copy, Plus, RefreshCw, Search } from 'lucide-react';
import {
  getRegisteredDevices,
  registerDevice,
  type RegisteredDevice,
} from '../services/deviceManagementApi';

export default function MacIdManagement() {
  const [search, setSearch] = useState('');
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [opened, setOpened] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [macId, setMacId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [generatedSecret, setGeneratedSecret] = useState('');
  const [registeredId, setRegisteredId] = useState('');

  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();

    const controller = new AbortController();
    request.current = controller;

    setLoading(true);
    setError('');

    try {
      const result = await getRegisteredDevices(controller.signal);

      if (!controller.signal.aborted) {
        setDevices(result);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load registered devices.'
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();

    return () => {
      request.current?.abort();
    };
  }, [load]);

  const closeModal = () => {
    if (saving) return;

    setOpened(false);
    setDeviceId('');
    setMacId('');
    setFormError('');
    setGeneratedSecret('');
    setRegisteredId('');
  };

  const handleRegister = async () => {
    const id = deviceId.trim().toUpperCase();
    const mac = macId.trim().toUpperCase();

    if (!/^[A-Z0-9_-]{1,64}$/.test(id)) {
      setFormError('Enter a valid Device ID.');
      return;
    }

    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      setFormError('Enter a valid MAC address, e.g. AA:BB:CC:DD:EE:01.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      const result = await registerDevice(id, mac);

      setRegisteredId(result.device.deviceId);
      setGeneratedSecret(result.deviceSecret);

      await load();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Unable to register device.'
      );
    } finally {
      setSaving(false);
    }
  };

  const query = search.trim().toLowerCase();

  const filtered = devices.filter(
    device =>
      device.deviceId.toLowerCase().includes(query) ||
      (device.macId ?? '').toLowerCase().includes(query)
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>MAC ID Management</Title>

        <Group>
          <Badge variant="light">
            {devices.length} registered devices
          </Badge>

          <Button
            leftSection={<Plus size={16} />}
            onClick={() => setOpened(true)}
          >
            Register Device
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Unable to refresh devices">
          {error}
        </Alert>
      )}

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="md">
          <TextInput
            label="Search devices"
            placeholder="Device ID or MAC address"
            leftSection={<Search size={16} />}
            value={search}
            onChange={event => setSearch(event.currentTarget.value)}
          />

          <Button
            variant="light"
            leftSection={<RefreshCw size={16} />}
            loading={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </Group>

        <Table.ScrollContainer minWidth={600}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Device ID</Table.Th>
                <Table.Th>MAC Address</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Credential Version</Table.Th>
                <Table.Th>Registered At</Table.Th>
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {filtered.map(device => (
                <Table.Tr key={device.deviceId}>
                  <Table.Td>{device.deviceId}</Table.Td>

                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {device.macId}
                    </Text>
                  </Table.Td>

                  <Table.Td>
                    <Badge
                      color={
                        device.status === 'active'
                          ? 'green'
                          : device.status === 'disabled'
                          ? 'red'
                          : 'yellow'
                      }
                    >
                      {device.status}
                    </Badge>
                  </Table.Td>

                  <Table.Td>{device.credentialVersion}</Table.Td>

                  <Table.Td>
                    {device.createdAt
                      ? new Date(device.createdAt).toLocaleString()
                      : '-'}
                  </Table.Td>
                </Table.Tr>
              ))}

              {!filtered.length && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="xl">
                      {loading
                        ? 'Loading devices...'
                        : error && !devices.length
                        ? 'Unable to load devices.'
                        : devices.length
                        ? 'No devices match your search.'
                        : 'No registered devices yet.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Modal
        opened={opened}
        onClose={closeModal}
        title="Register New Controller"
        centered
        closeOnEscape={!saving}
        closeOnClickOutside={false}
        withCloseButton={!saving}
      >
        <Stack gap="md">
          {!generatedSecret ? (
            <>
              <TextInput
                label="Device ID"
                placeholder="BUSBAR-001"
                required
                value={deviceId}
                onChange={event => setDeviceId(event.currentTarget.value)}
                disabled={saving}
              />

              <TextInput
                label="MAC Address"
                placeholder="AA:BB:CC:DD:EE:01"
                required
                value={macId}
                onChange={event => setMacId(event.currentTarget.value)}
                disabled={saving}
              />

              {formError && (
                <Alert color="red">{formError}</Alert>
              )}

              <Button
                fullWidth
                loading={saving}
                onClick={() => void handleRegister()}
              >
                Register Controller
              </Button>
            </>
          ) : (
            <>
              <Alert color="green" title="Controller Registered">
                {registeredId} has been registered successfully.
              </Alert>

              <Text size="sm" fw={500}>
                Generated Device Secret
              </Text>

              <PasswordInput
                value={generatedSecret}
                readOnly
                visibilityToggleButtonProps={{
                  'aria-label': 'Show or hide device secret',
                }}
              />

              <CopyButton value={generatedSecret}>
                {({ copied, copy }) => (
                  <Button
                    variant="light"
                    leftSection={<Copy size={16} />}
                    onClick={copy}
                  >
                    {copied ? 'Copied' : 'Copy Device Secret'}
                  </Button>
                )}
              </CopyButton>

              <Alert color="yellow">
                Save this secret securely. It will not be displayed again
                after closing this window. Treat copied clipboard data
                as sensitive.
              </Alert>

              <Button onClick={closeModal}>
                Done
              </Button>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
