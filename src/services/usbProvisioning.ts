/** BCPP v1 binary USB exchange with a final A5 confirmation, 9600 8N1. */
import {
  PACKET,
  MAX_FRAME,
  helloPacket,
  parseFrame,
  parseHelloResponse,
  provisionPacket,
  parseProvisionResponse,
  packetLogSummary,
  provisioningConfirmationPacket,
} from './busbarPacketProtocol';
export const APIM_VOLTAGE_URL = 'https://busbar-apim-dev.azure-api.net/v1/voltage';
export type Identity = { deviceId: string; macId: string };
export type UsbPort = {
  open(options: {
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: 'none';
  }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};
type SerialNavigator = Navigator & { serial: { requestPort(): Promise<UsbPort> } };
export type UsbProvisioningSession = ReturnType<typeof createUsbProvisioningSession>;

// Every call owns a separate port, reader, and receive buffer. The returned
// functions share these variables without a class or a dynamic "this" binding.
export function createUsbProvisioningSession() {
  let port: UsbPort | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let buffer = new Uint8Array(0);

  async function connect(): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error('Use Microsoft Edge or Chrome on HTTPS or localhost for Web Serial.');
    }
    const selectedPort = await (navigator as SerialNavigator).serial.requestPort();
    port = selectedPort;
    await selectedPort.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    if (!selectedPort.readable || !selectedPort.writable) {
      throw new Error('Serial port does not support reading and writing.');
    }
    reader = selectedPort.readable.getReader();
  }
  async function send(bytes: Uint8Array): Promise<void> {
    if (!port?.writable) {
      throw new Error('Serial port disconnected.');
    }
    const writer = port.writable.getWriter();
    try {
      console.info('[BCPP TX]', packetLogSummary(bytes));
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }
  async function receive(expectedCode: number, timeoutMs = 6000): Promise<Uint8Array> {
    // Serial reads can contain part of a packet or several packets. Keep unused
    // bytes for the next response instead of assuming one read equals one packet.
    if (!reader) {
      throw new Error('Serial port is not open.');
    }
    const activeReader = reader;
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      void activeReader.cancel().catch(() => {});
    }, timeoutMs);
    try {
      while (true) {
        // STX is one byte; length is uint16 little-endian at offsets 1-2.
        const start = buffer.indexOf(2);
        if (start < 0) {
          buffer = new Uint8Array(0);
        } else if (start > 0) {
          buffer = buffer.slice(start);
        }
        if (buffer.length >= 3) {
          const length = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
          ).getUint16(1, true);
          if (length < 6 || length > MAX_FRAME) {
            throw new Error(`Invalid controller packet length: ${length}`);
          }
          if (buffer.length >= length) {
            const packet = buffer.slice(0, length);
            console.info('[BCPP RX]', packetLogSummary(packet));
            const parsed = parseFrame(packet);
            buffer = buffer.slice(length);
            if (parsed.code !== expectedCode) {
              throw new Error(`Unexpected controller packet 0x${parsed.code.toString(16)}`);
            }
            return parsed.payload;
          }
        }
        const result = await activeReader.read();
        if (result.done) {
          throw new Error(
            expired ? 'Controller response timed out. Reconnect USB.' : 'Controller disconnected.',
          );
        }
        const next = new Uint8Array(buffer.length + result.value.length);
        next.set(buffer);
        next.set(result.value, buffer.length);
        buffer = next;
        console.debug(
          '[BCPP RX chunk]',
          result.value.length,
          'bytes; buffered',
          buffer.length,
          'bytes',
        );
        if (buffer.length > MAX_FRAME * 2) {
          throw new Error('Serial receive buffer exceeded limit');
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }
  async function hello(): Promise<Identity> {
    await send(helloPacket());
    return parseHelloResponse(await receive(PACKET.HELLO_RESPONSE));
  }
  async function eraseCancelledConfiguration(): Promise<void> {
    // No authenticated erasure command has been agreed within the four packet codes.
    // Do not bypass recovery safeguards or falsely report erasure.
    throw new Error(
      'Cancelled-device recovery is unavailable in BCPP v1 until firmware defines authenticated erasure.',
    );
  }
  async function provision(
    identity: Identity,
    transaction: {
      transactionId: string;
      challenge: string;
      apimUrl: string;
      deviceSecret: string;
    },
  ): Promise<string> {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(transaction.deviceSecret) ||
      !/^[a-f0-9]{64}$/i.test(transaction.challenge) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        transaction.transactionId,
      ) ||
      transaction.apimUrl !== APIM_VOLTAGE_URL
    ) {
      throw new Error('Unexpected provisioning parameters from Azure.');
    }
    await send(provisionPacket(identity, transaction));
    return parseProvisionResponse(await receive(PACKET.PROVISION_RESPONSE, 10000));
  }
  async function sendProvisioningConfirmation(success: boolean): Promise<void> {
    await send(provisioningConfirmationPacket(success));
  }
  async function close(): Promise<void> {
    try {
      await reader?.cancel();
    } catch {
      /* disconnected */
    }
    try {
      reader?.releaseLock();
    } catch {
      /* released */
    }
    reader = null;
    try {
      await port?.close();
    } catch {
      /* disconnected */
    }
    port = null;
    buffer = new Uint8Array(0);
  }
  return {
    connect,
    hello,
    eraseCancelledConfiguration,
    provision,
    sendProvisioningConfirmation,
    close,
  };
}
