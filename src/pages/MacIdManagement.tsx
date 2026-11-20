import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Plug, RefreshCw, Search } from 'lucide-react';
import {
  getRegisteredDevices,
  beginDeviceProvisioning,
  completeDeviceProvisioning,
  cancelDeviceProvisioning,
  updateDeviceStatus,
  retryDeviceProvisioning,
  type RegisteredDevice,
} from '../services/deviceManagementApi';
import {
  createUsbProvisioningSession,
  type UsbProvisioningSession,
  type Identity,
} from '../services/usbProvisioning';
import { provisioningAction } from '../services/provisioningAttempt';

type WizardStage =
  | 'idle'
  | 'connecting'
  | 'identified'
  | 'registering'
  | 'provisioning'
  | 'activating'
  | 'completed'
  | 'failed';
export default function MacIdManagement() {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [stage, setStage] = useState<WizardStage>('idle');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [wizardError, setWizardError] = useState('');
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const session = useRef<UsbProvisioningSession | null>(null);
  const mounted = useRef(true);
  const operationInProgress = useRef(false);
  // The ref blocks repeated clicks immediately; state updates the button display.
  const [isOperating, setIsOperating] = useState(false);
  const deviceListRequest = useRef<AbortController | null>(null);

  const loadDevices = useCallback(async () => {
    deviceListRequest.current?.abort();
    const controller = new AbortController();
    deviceListRequest.current = controller;
    setLoading(true);
    try {
      const result = await getRegisteredDevices(controller.signal);
      if (!controller.signal.aborted) {
        setDevices(result);
        setError('');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : 'Unable to load devices');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // Schedule the initial fetch after the effect, avoiding synchronous state updates.
    queueMicrotask(() => {
      if (mounted.current) {
        void loadDevices();
      }
    });
    return () => {
      mounted.current = false;
      deviceListRequest.current?.abort();
      void session.current?.close();
    };
  }, [loadDevices]);

  const connectController = async () => {
    if (operationInProgress.current) {
      return;
    }
    operationInProgress.current = true;
    setIsOperating(true);
    setOpened(true);
    setStage('connecting');
    setWizardError('');
    setIdentity(null);
    setRecoveryNeeded(false);
    setRecoveryMode(false);
    const usb = createUsbProvisioningSession();
    session.current = usb;
    try {
      await usb.connect();
      const found = await usb.hello();
      if (!mounted.current) {
        return;
      }
      setIdentity(found);
      setStage('identified');
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : String(error));
      setStage('failed');
      await usb.close();
      session.current = null;
    } finally {
      operationInProgress.current = false;
      setIsOperating(false);
    }
  };

  const registerAndProvision = async () => {
    if (!identity || !session.current || operationInProgress.current) {
      return;
    }
    operationInProgress.current = true;
    setIsOperating(true);
    let transactionId: string | null = null;
    let activated = false;
    try {
      const existing = await getRegisteredDevices();
      const action = provisioningAction(existing, identity);
      setStage('registering');
      setRecoveryMode(action === 'retry');
      const transaction =
        action === 'retry'
          ? await retryDeviceProvisioning(identity.deviceId, identity.macId)
          : await beginDeviceProvisioning(identity.deviceId, identity.macId);
      transactionId = transaction.transactionId;
      if (transaction.deviceId !== identity.deviceId || transaction.macId !== identity.macId) {
        throw new Error('Azure returned an unexpected controller identity.');
      }
      setStage('provisioning');
      // A3 sends configuration; A4 returns the proof Azure needs for activation.
      const proof = await session.current.provision(identity, transaction);
      setStage('activating');

      await completeDeviceProvisioning(identity.deviceId, transaction.transactionId, proof);

      activated = true;

      // A failed A5 confirmation must not cancel a device already activated in Azure.
      try {
        await session.current.sendProvisioningConfirmation(true);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'USB communication failed';

        setWizardError(
          `Azure activation succeeded, but the controller ` +
            `confirmation (A5) could not be sent: ${reason}`,
        );

        setStage('failed');
        await loadDevices();
        return;
      }

      setStage('completed');
      await loadDevices();
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Provisioning failed';
      // Cancel only unfinished registrations. The controller may need a retry.
      if (transactionId && !activated) {
        try {
          await cancelDeviceProvisioning(identity.deviceId, transactionId);
          message +=
            ' The attempt was cancelled and the device is not active. Reconnect to retry provisioning.';
        } catch {
          message +=
            ' Cancellation could not be confirmed. Refresh the device list to check its status. Retry will only be allowed if the attempt is still incomplete.';
        }
      }
      setRecoveryNeeded(!!transactionId);
      setWizardError(message);
      setStage('failed');
      void loadDevices();
    } finally {
      await session.current?.close();
      session.current = null;
      operationInProgress.current = false;
      setIsOperating(false);
    }
  };

  const closeWizard = async () => {
    if (operationInProgress.current) {
      return;
    }
    await session.current?.close();
    session.current = null;
    setOpened(false);
    setIdentity(null);
    setStage('idle');
    setWizardError('');
    setRecoveryNeeded(false);
  };

  const changeStatus = async (device: RegisteredDevice) => {
    setBusyDevice(device.deviceId);
    try {
      await updateDeviceStatus(device.deviceId, device.status === 'active' ? 'disabled' : 'active');
      await loadDevices();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Status update failed');
    } finally {
      setBusyDevice(null);
    }
  };
  const filteredDevices = devices.filter((device) =>
    (device.deviceId + ' ' + device.macId).toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Device Management</Title>
        <Button
          leftSection={<Plug size={16} />}
          onClick={() => void connectController()}
          disabled={opened}
        >
          Register Controller via USB
        </Button>
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      <Paper withBorder p="md" radius="md">
        <Stack>
          <Group justify="space-between">
            <TextInput
              label="Search devices"
              placeholder="Device ID or MAC address"
              leftSection={<Search size={16} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Button
              variant="light"
              leftSection={<RefreshCw size={16} />}
              loading={loading}
              onClick={() => {
                void loadDevices();
              }}
            >
              Refresh
            </Button>
          </Group>
          <Table.ScrollContainer minWidth={700}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Device ID</Table.Th>
                  <Table.Th>MAC Address</Table.Th>
                  <Table.Th>Registration status</Table.Th>
                  <Table.Th>Version</Table.Th>
                  <Table.Th>Registered</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredDevices.map((device) => (
                  <Table.Tr key={device.deviceId}>
                    <Table.Td>{device.deviceId}</Table.Td>
                    <Table.Td>{device.macId}</Table.Td>
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
                      {device.createdAt ? new Date(device.createdAt).toLocaleString() : '-'}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          disabled={
                            busyDevice !== null ||
                            (device.status !== 'active' && device.status !== 'disabled')
                          }
                          loading={busyDevice === device.deviceId}
                          onClick={() => void changeStatus(device)}
                        >
                          {device.status === 'active' ? 'Disable' : 'Activate'}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {!filteredDevices.length && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text ta="center" c="dimmed">
                        No matching devices
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Paper>
      <Modal
        opened={opened}
        onClose={() => void closeWizard()}
        title="USB Controller Registration"
        closeOnEscape={!isOperating}
        closeOnClickOutside={false}
        withCloseButton={!isOperating}
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Connect the USB controller at 9600 8N1 (BCPP v1 binary). For COM3/COM4 mock testing, the
            mock listens on COM4. Device IDs must be numeric uint32 values.
          </Text>
          <Text>
            Stage: <strong>{stage}</strong>
          </Text>
          {identity && (
            <Paper withBorder p="sm">
              <Text>
                Device ID: <strong>{identity.deviceId}</strong>
              </Text>
              <Text>
                MAC ID: <strong>{identity.macId}</strong>
              </Text>
            </Paper>
          )}
          {wizardError && (
            <Alert
              color="red"
              title={recoveryNeeded ? 'Provisioning incomplete' : 'Unable to continue'}
            >
              {wizardError}
            </Alert>
          )}
          {recoveryMode && (
            <Text size="xs" c="dimmed">
              Retry sends a new configuration to this controller. If the controller rejects it,
              reset it according to the firmware instructions before retrying.
            </Text>
          )}
          {stage === 'completed' && (
            <Alert color="green" title="Controller activated">
              The controller proved possession of the stored credential and Azure status is active.
              You can disconnect USB.
            </Alert>
          )}
          {stage === 'identified' && (
            <Button onClick={() => void registerAndProvision()}>
              Register / Retry Provisioning
            </Button>
          )}
          {['connecting', 'registering', 'provisioning', 'activating'].includes(stage) && (
            <Button loading disabled>
              Working...
            </Button>
          )}
          {stage === 'failed' && (
            <Button variant="light" onClick={() => void connectController()}>
              Reconnect &amp; Retry Provisioning
            </Button>
          )}
          <Button variant="subtle" disabled={isOperating} onClick={() => void closeWizard()}>
            Close
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
