/** Four-packet BCPP v1 binary USB protocol, 9600 8N1. */
import { PACKET, MAX_FRAME, helloPacket, parseFrame, parseHelloResponse, provisionPacket, parseProvisionResponse } from './busbarPacketProtocol';
export const APIM_VOLTAGE_URL = 'https://busbar-apim-dev.azure-api.net/v1/voltage';
export type Identity = { deviceId: string; macId: string };
export type UsbPort = {
  open(options: { baudRate: number; dataBits: number; stopBits: number; parity: 'none' }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};
type SerialNavigator = Navigator & { serial: { requestPort(): Promise<UsbPort> } };
export class UsbProvisioningSession {
  private port: UsbPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = new Uint8Array(0);
  async connect(): Promise<void> {
    if (!('serial' in navigator)) throw new Error('Use Microsoft Edge or Chrome on HTTPS or localhost for Web Serial.');
    const port = await (navigator as SerialNavigator).serial.requestPort();
    this.port = port;
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    if (!port.readable || !port.writable) throw new Error('Serial port does not support reading and writing.');
    this.reader = port.readable.getReader();
  }
  private async send(bytes: Uint8Array): Promise<void> {
    if (!this.port?.writable) throw new Error('Serial port disconnected.');
    const writer = this.port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
  }
  private async receive(expectedCode: number, timeoutMs = 6000): Promise<Uint8Array> {
    if (!this.reader) throw new Error('Serial port is not open.');
    const reader = this.reader;
    let expired = false;
    const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, timeoutMs);
    try {
      while (true) {
        // Discard noise until the STX pair, retaining a possible trailing STX.
        let start = -1;
        for (let i = 0; i < this.buffer.length - 1; i++) {
          if (this.buffer[i] === 2 && this.buffer[i + 1] === 2) { start = i; break; }
        }
        if (start < 0) this.buffer = this.buffer.length && this.buffer[this.buffer.length - 1] === 2 ? Uint8Array.of(2) : new Uint8Array(0);
        else if (start > 0) this.buffer = this.buffer.slice(start);
        if (this.buffer.length >= 5) {
          const length = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength).getUint16(3, true);
          if (length < 8 || length > MAX_FRAME) throw new Error('Invalid controller packet length');
          if (this.buffer.length >= length) {
            const parsed = parseFrame(this.buffer.slice(0, length));
            this.buffer = this.buffer.slice(length);
            if (parsed.code !== expectedCode) throw new Error(`Unexpected controller packet 0x${parsed.code.toString(16)}`);
            return parsed.payload;
          }
        }
        const result = await reader.read();
        if (result.done) throw new Error(expired ? 'Controller response timed out. Reconnect USB.' : 'Controller disconnected.');
        const next = new Uint8Array(this.buffer.length + result.value.length);
        next.set(this.buffer); next.set(result.value, this.buffer.length);
        this.buffer = next;
        if (this.buffer.length > MAX_FRAME * 2) throw new Error('Serial receive buffer exceeded limit');
      }
    } finally { clearTimeout(timer); }
  }
  async hello(): Promise<Identity> {
    await this.send(helloPacket());
    return parseHelloResponse(await this.receive(PACKET.HELLO_RESPONSE));
  }
  async eraseCancelledConfiguration(_identity: Identity): Promise<void> {
    // No authenticated erasure command has been agreed within the four packet codes.
    // Do not bypass recovery safeguards or falsely report erasure.
    throw new Error('Cancelled-device recovery is unavailable in BCPP v1 until firmware defines authenticated erasure.');
  }
  async provision(identity: Identity, tx: {transactionId: string; challenge: string; apimUrl: string; deviceSecret: string}): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(tx.deviceSecret) || !/^[a-f0-9]{64}$/i.test(tx.challenge) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.transactionId) ||
        tx.apimUrl !== APIM_VOLTAGE_URL) throw new Error('Unexpected provisioning parameters from Azure.');
    await this.send(provisionPacket(identity, tx));
    return parseProvisionResponse(await this.receive(PACKET.PROVISION_RESPONSE, 10000));
  }
  async close(): Promise<void> {
    try { await this.reader?.cancel(); } catch { /* disconnected */ }
    try { this.reader?.releaseLock(); } catch { /* released */ }
    this.reader = null;
    try { await this.port?.close(); } catch { /* disconnected */ }
    this.port = null; this.buffer = new Uint8Array(0);
  }
}
