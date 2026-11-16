import { useRef, useState } from 'react';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';

type ControllerIdentity = { deviceId: string; macId: string };
type SerialReader = ReadableStreamDefaultReader<Uint8Array>;
type UsbSerialPort = {
  open(options: { baudRate: number; dataBits: number; stopBits: number; parity: string }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};
type SerialNavigator = Navigator & { serial: { requestPort(): Promise<UsbSerialPort> } };

export default function UsbHelloTest() {
  const portRef = useRef<UsbSerialPort | null>(null);
  const readerRef = useRef<SerialReader | null>(null);
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState<ControllerIdentity | null>(null);
  const [message, setMessage] = useState('Not connected');

  async function disconnect() {
    try { await readerRef.current?.cancel(); } catch { /* already closed */ }
    try { readerRef.current?.releaseLock(); } catch { /* already released */ }
    readerRef.current = null;
    try { await portRef.current?.close(); } catch { /* port may already be closed */ }
    portRef.current = null;
  }

  async function connectAndHello() {
    setBusy(true);
    setIdentity(null);
    try {
      if (!('serial' in navigator)) throw new Error('Web Serial requires Chrome/Edge on localhost or HTTPS.');
      const port = await (navigator as SerialNavigator).serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
      setMessage('Connected. Sending HELLO...');
      const writer = port.writable?.getWriter();
      if (!writer) throw new Error('Serial port is not writable');
      try { await writer.write(new TextEncoder().encode(JSON.stringify({ command: 'HELLO' }) + '\n')); }
      finally { writer.releaseLock(); }

      const reader = port.readable?.getReader();
      if (!reader) throw new Error('Serial port is not readable');
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 5000);
      try {
      while (true) {
        const result = await reader.read();
        if (result.done) throw new Error('No HELLO_ACK received within 5 seconds or port disconnected');
        buffer += decoder.decode(result.value, { stream: true });
        if (buffer.length > 4096) throw new Error('Serial response too large');
        while (buffer.includes('\n')) {
          const index = buffer.indexOf('\n');
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          let reply: unknown;
          try { reply = JSON.parse(line); } catch { continue; }
          if (reply && typeof reply === 'object' && 'command' in reply && reply.command === 'HELLO_ACK' &&
              'deviceId' in reply && typeof reply.deviceId === 'string' &&
              'macId' in reply && typeof reply.macId === 'string') {
            setIdentity({ deviceId: reply.deviceId, macId: reply.macId });
            setMessage('HELLO_ACK received');
            return;
          }
        }
      }
      } finally { clearTimeout(timeout); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      await disconnect();
      setBusy(false);
    }
  }

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Title order={3}>USB Controller Handshake Test</Title>
        <Group><Button loading={busy} onClick={() => void connectAndHello()}>Connect and send HELLO</Button></Group>
        <Text>{message}</Text>
        {identity && <><Text>Device ID: {identity.deviceId}</Text><Text>MAC ID: {identity.macId}</Text></>}
      </Stack>
    </Paper>
  );
}
