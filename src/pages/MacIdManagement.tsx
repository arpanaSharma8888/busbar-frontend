import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { Plug, RefreshCw, Search } from 'lucide-react';
import { getRegisteredDevices, beginDeviceProvisioning, completeDeviceProvisioning, cancelDeviceProvisioning, updateDeviceStatus, retryCancelledProvisioning, type RegisteredDevice } from '../services/deviceManagementApi';
import { UsbProvisioningSession, type Identity } from '../services/usbProvisioning';

type WizardStage = 'idle' | 'connecting' | 'identified' | 'registering' | 'provisioning' | 'activating' | 'completed' | 'failed';
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
  const operation = useRef(false);
  const [isOperating, setIsOperating] = useState(false);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    try { const result = await getRegisteredDevices(controller.signal); if (!controller.signal.aborted) { setDevices(result); setError(''); } }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load devices'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // Schedule the initial fetch after the effect, avoiding synchronous state updates.
    queueMicrotask(() => { if (mounted.current) { void load(); } });
    return () => { mounted.current = false; request.current?.abort(); void session.current?.close(); };
  }, [load]);

  const start = async () => {
    if (operation.current) return;
    operation.current = true; setIsOperating(true); setOpened(true); setStage('connecting'); setWizardError(''); setIdentity(null); setRecoveryNeeded(false); setRecoveryMode(false);
    const usb = new UsbProvisioningSession(); session.current = usb;
    try {
      await usb.connect();
      const found = await usb.hello();
      if (!mounted.current) return;
      setIdentity(found); setStage('identified');
    } catch (e) {
      setWizardError(e instanceof Error ? e.message : String(e)); setStage('failed');
      await usb.close(); session.current = null;
    } finally { operation.current = false; setIsOperating(false); }
  };

  const registerAndProvision = async () => {
    if (!identity || !session.current || operation.current) return;
    operation.current = true; setIsOperating(true);
    let transactionId: string | null = null;
    let activated = false;
    try {
      const existing = await getRegisteredDevices();
      const sameId = existing.find(d => d.deviceId === identity.deviceId);
      const sameMac = existing.find(d => d.macId.toUpperCase() === identity.macId);
      if (sameMac && sameMac.deviceId !== identity.deviceId)
        throw new Error('MAC address belongs to another device; recovery blocked.');
      if (sameId && (sameId.status !== 'cancelled' || sameId.macId.toUpperCase() !== identity.macId))
        throw new Error('Device exists but is not eligible for cancelled-attempt recovery.');
      setStage('registering');
      if (sameId) {
        setRecoveryMode(true);
        // The connected mock must acknowledge removing the old test configuration
        // before Azure replaces the cancelled record with a new pending transaction.
        await session.current.eraseCancelledConfiguration(identity);
      }
      const tx = sameId
        ? await retryCancelledProvisioning(identity.deviceId, identity.macId)
        : await beginDeviceProvisioning(identity.deviceId, identity.macId);
      transactionId = tx.transactionId;
      if (tx.deviceId !== identity.deviceId || tx.macId !== identity.macId)
        throw new Error('Azure returned an unexpected controller identity.');
      setStage('provisioning');
      const proof = await session.current.provision(identity, tx);
      setStage('activating');
      await completeDeviceProvisioning(identity.deviceId, tx.transactionId, proof);
      activated = true;
      setStage('completed');
      await load();
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Provisioning failed';
      if (transactionId && !activated) {
        try {
          await cancelDeviceProvisioning(identity.deviceId, transactionId);
          message += ' The Azure attempt was cancelled. The controller may still retain credentials: erase them securely before any retry.';
        } catch {
          message += ' Azure cancellation could not be confirmed. The record may remain pending or may have activated if the completion response was lost. Check Azure before retrying.';
        }
      }
      setRecoveryNeeded(!!transactionId);
      setWizardError(message);
      setStage('failed');
      void load();
    } finally {
      await session.current?.close(); session.current = null;
      operation.current = false; setIsOperating(false);
    }
  };

  const closeWizard = async () => {
    if (operation.current) return;
    await session.current?.close(); session.current = null;
    setOpened(false); setIdentity(null); setStage('idle'); setWizardError(''); setRecoveryNeeded(false);
  };

  const changeStatus = async (device: RegisteredDevice) => {
    setBusyDevice(device.deviceId);
    try { await updateDeviceStatus(device.deviceId, device.status === 'active' ? 'disabled' : 'active'); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Status update failed'); }
    finally { setBusyDevice(null); }
  };
  const filtered = devices.filter(d => ['active','disabled'].includes(d.status) && (d.deviceId + ' ' + d.macId).toLowerCase().includes(search.trim().toLowerCase()));
  return <Stack gap="md">
    <Group justify="space-between"><Title order={2}>Device Management</Title><Button leftSection={<Plug size={16}/>} onClick={() => void start()} disabled={opened}>Register Controller via USB</Button></Group>
    {error && <Alert color="red">{error}</Alert>}
    <Paper withBorder p="md" radius="md"><Stack>
      <Group justify="space-between"><TextInput label="Search devices" placeholder="Device ID or MAC address" leftSection={<Search size={16}/>} value={search} onChange={e => setSearch(e.currentTarget.value)}/><Button variant="light" leftSection={<RefreshCw size={16}/>} loading={loading} onClick={() => { void load(); }}>Refresh</Button></Group>
      <Table.ScrollContainer minWidth={700}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Device ID</Table.Th><Table.Th>MAC Address</Table.Th><Table.Th>Status</Table.Th><Table.Th>Version</Table.Th><Table.Th>Registered</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{filtered.map(d => <Table.Tr key={d.deviceId}><Table.Td>{d.deviceId}</Table.Td><Table.Td>{d.macId}</Table.Td><Table.Td><Badge color={d.status === 'active' ? 'green' : d.status === 'disabled' ? 'red' : 'yellow'}>{d.status}</Badge></Table.Td><Table.Td>{d.credentialVersion}</Table.Td><Table.Td>{d.createdAt ? new Date(d.createdAt).toLocaleString() : '-'}</Table.Td><Table.Td><Group gap="xs"><Button size="xs" variant="light" disabled={busyDevice !== null || (d.status !== 'active' && d.status !== 'disabled')} loading={busyDevice === d.deviceId} onClick={() => void changeStatus(d)}>{d.status === 'active' ? 'Disable' : 'Activate'}</Button></Group></Table.Td></Table.Tr>)}
      {!filtered.length && <Table.Tr><Table.Td colSpan={6}><Text ta="center" c="dimmed">No matching devices</Text></Table.Td></Table.Tr>}</Table.Tbody></Table></Table.ScrollContainer>

    </Stack></Paper>
    <Modal opened={opened} onClose={() => void closeWizard()} title="USB Controller Registration" closeOnEscape={!isOperating} closeOnClickOutside={false} withCloseButton={!isOperating} centered><Stack>
      <Text size="sm" c="dimmed">Connect the USB controller at 9600 8N1 (BCPP v1 binary). For COM3/COM4 mock testing, the mock listens on COM4. Device IDs must be numeric uint32 values.</Text>
      <Text>Stage: <strong>{stage}</strong></Text>
      {identity && <Paper withBorder p="sm"><Text>Device ID: <strong>{identity.deviceId}</strong></Text><Text>MAC ID: <strong>{identity.macId}</strong></Text></Paper>}
      {wizardError && <Alert color="red" title={recoveryNeeded ? 'Provisioning incomplete' : 'Unable to continue'}>{wizardError}</Alert>}
      {recoveryMode && <Text size="xs" c="dimmed">Recovery requires a firmware-approved authenticated erasure operation; it is not yet available in the four-packet protocol.</Text>}
      {stage === 'completed' && <Alert color="green" title="Controller activated">The controller proved possession of the stored credential and Azure status is active. You can disconnect USB.</Alert>}
      {stage === 'identified' && <Button onClick={() => void registerAndProvision()}>Register / Recover &amp; Provision Controller</Button>}
      {['connecting','registering','provisioning','activating'].includes(stage) && <Button loading disabled>Working...</Button>}
      {stage === 'failed' && !recoveryNeeded && <Button variant="light" onClick={() => void start()}>Reconnect &amp; Retry HELLO</Button>}
      <Button variant="subtle" disabled={isOperating} onClick={() => void closeWizard()}>Close</Button>
    </Stack></Modal>
  </Stack>;
}
