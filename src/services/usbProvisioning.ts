/** Test protocol: newline-delimited JSON, 9600 8N1. Replace framing with firmware specification later. */
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
  private buffer = '';
  private decoder = new TextDecoder();

  async connect(): Promise<void> {
    if (!('serial' in navigator)) throw new Error('Use Microsoft Edge or Chrome on HTTPS or localhost for Web Serial.');
    const port = await (navigator as SerialNavigator).serial.requestPort();
    this.port = port;
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    if (!port.readable || !port.writable) throw new Error('Serial port does not support reading and writing.');
    this.reader = port.readable.getReader();
  }

  private async send(message: unknown): Promise<void> {
    if (!this.port?.writable) throw new Error('Serial port disconnected.');
    const writer = this.port.writable.getWriter();
    try { await writer.write(new TextEncoder().encode(JSON.stringify(message) + '\n')); }
    finally { writer.releaseLock(); }
  }

  private async receive(expectedCommand: string, timeoutMs = 6000): Promise<Record<string, unknown>> {
    if (!this.reader) throw new Error('Serial port is not open.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A timeout cancels the stream; the session must then be closed/reconnected.
    timer = setTimeout(() => { void this.reader?.cancel().catch(() => {}); }, timeoutMs);
    try {
      while (true) {
        const newline = this.buffer.indexOf('\n');
        if (newline !== -1) {
          const line = this.buffer.slice(0, newline).trim();
          this.buffer = this.buffer.slice(newline + 1);
          if (!line) continue;
          let parsed: unknown;
          try { parsed = JSON.parse(line); } catch { continue; }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
          const reply = parsed as Record<string, unknown>;
          if (reply.command === expectedCommand) return reply;
          if (reply.command === 'ERROR') throw new Error(String(reply.message ?? 'Controller rejected request'));
          continue;
        }
        const result = await this.reader.read();
        if (result.done) throw new Error(`Timed out or disconnected while waiting for ${expectedCommand}.`);
        this.buffer += this.decoder.decode(result.value, { stream: true });
        if (this.buffer.length > 8192) throw new Error('Serial packet exceeds 8 KB.');
      }
    } finally { if (timer) clearTimeout(timer); }
  }

  async hello(): Promise<Identity> {
    await this.send({ command: 'HELLO' });
    const reply = await this.receive('HELLO_ACK');
    const deviceId = typeof reply.deviceId === 'string' ? reply.deviceId.trim().toUpperCase() : '';
    const macId = typeof reply.macId === 'string' ? reply.macId.trim().toUpperCase() : '';
    if (!/^[A-Z0-9_-]{1,64}$/.test(deviceId) || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macId)) {
      throw new Error('Controller returned an invalid Device ID or MAC address.');
    }
    return { deviceId, macId };
  }

  async provision(identity: Identity, tx: {transactionId:string; challenge:string; apimUrl:string; deviceSecret:string}): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(tx.deviceSecret) || !/^[a-f0-9]{64}$/i.test(tx.challenge) ||
        !/^[0-9a-f-]{36}$/i.test(tx.transactionId) || tx.apimUrl !== APIM_VOLTAGE_URL) {
      throw new Error('Unexpected provisioning parameters from Azure.');
    }
    await this.send({command:'PROVISION', deviceId:identity.deviceId, macId:identity.macId,
      transactionId:tx.transactionId, url:tx.apimUrl, deviceSecret:tx.deviceSecret});
    const ack = await this.receive('PROVISION_ACK', 10000);
    if (ack.deviceId !== identity.deviceId || ack.transactionId !== tx.transactionId || ack.status !== 'SAVED')
      throw new Error('Controller did not acknowledge persistent credential storage.');
    await this.send({command:'VERIFY_CHALLENGE', deviceId:identity.deviceId,
      transactionId:tx.transactionId, challenge:tx.challenge});
    const reply = await this.receive('VERIFY_RESPONSE', 6000);
    if (reply.deviceId !== identity.deviceId || reply.transactionId !== tx.transactionId ||
        typeof reply.proof !== 'string' || !/^[a-f0-9]{64}$/i.test(reply.proof))
      throw new Error('Controller did not return a valid-format provisioning proof.');
    return reply.proof;
  }

  async close(): Promise<void> {
    try { await this.reader?.cancel(); } catch { /* already closed */ }
    try { this.reader?.releaseLock(); } catch { /* already released */ }
    this.reader = null;
    try { await this.port?.close(); } catch { /* disconnected */ }
    this.port = null;
    this.buffer = '';
  }
}
