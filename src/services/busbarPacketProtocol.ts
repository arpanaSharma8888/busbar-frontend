/** BCPP v1: 9600 8N1; little-endian length/device ID; CRC-16/CCITT-FALSE over code through payload. */
export const PACKET = { HELLO: 0xA1, HELLO_RESPONSE: 0xA2, PROVISION: 0xA3, PROVISION_RESPONSE: 0xA4 } as const;
export const STX = 0x02;
const HEADER = 5;
const TRAILER = 2;
export const MAX_FRAME = 577;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
export function frame(code: number, payload: Uint8Array): Uint8Array {
  const size = HEADER + payload.length + TRAILER;
  if (size > MAX_FRAME) throw new Error('Packet exceeds maximum length');
  const out = new Uint8Array(size);
  out[0] = STX; out[1] = STX; out[2] = code;
  new DataView(out.buffer).setUint16(3, size, true);
  out.set(payload, HEADER);
  new DataView(out.buffer).setUint16(size - 2, crc16(out.subarray(2, size - 2)), true);
  return out;
}
export function parseFrame(bytes: Uint8Array): { code: number; payload: Uint8Array } {
  if (bytes.length < 8 || bytes[0] !== STX || bytes[1] !== STX) throw new Error('Invalid packet start');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(3, true) !== bytes.length) throw new Error('Invalid packet length');
  if (view.getUint16(bytes.length - 2, true) !== crc16(bytes.subarray(2, bytes.length - 2))) throw new Error('Controller packet CRC mismatch');
  return { code: bytes[2], payload: bytes.slice(HEADER, -TRAILER) };
}
export function deviceIdToNumber(id: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(id)) throw new Error('Firmware protocol requires a numeric 32-bit Device ID');
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n > 0xffffffff) throw new Error('Device ID is outside uint32 range');
  return n;
}
export function macToBytes(mac: string): Uint8Array {
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(mac)) throw new Error('Invalid MAC ID');
  return Uint8Array.from(mac.split(':').map(x => parseInt(x, 16)));
}
export function bytesToMac(bytes: Uint8Array): string {
  if (bytes.length !== 6) throw new Error('MAC must contain six bytes');
  return [...bytes].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}
function uuidBytes(uuid: string): Uint8Array {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)) throw new Error('Invalid transaction UUID');
  const compact = uuid.replace(/-/g, '');
  return Uint8Array.from(compact.match(/../g)!.map(x => parseInt(x, 16)));
}
function hexBytes(hex: string, length: number): Uint8Array {
  if (!new RegExp(`^[0-9a-f]{${length * 2}}$`, 'i').test(hex)) throw new Error('Invalid challenge');
  return Uint8Array.from(hex.match(/../g)!.map(x => parseInt(x, 16)));
}
function fixedUtf8(value: string, size: number): Uint8Array {
  const bytes = encoder.encode(value);
  if (!bytes.length || bytes.length > size || bytes.includes(0)) throw new Error('Invalid fixed-width string');
  const result = new Uint8Array(size); result.set(bytes); return result;
}
export function decodeFixedUtf8(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  if (end >= 0 && bytes.subarray(end).some(x => x !== 0)) throw new Error('Invalid string padding');
  return decoder.decode(end >= 0 ? bytes.subarray(0, end) : bytes);
}
export function helloPacket(): Uint8Array { return frame(PACKET.HELLO, Uint8Array.of(0x01)); }
export function parseHelloResponse(payload: Uint8Array): {deviceId: string; macId: string} {
  if (payload.length !== 10) throw new Error('Unexpected HELLO_RESPONSE size');
  const id = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(6, true);
  return { macId: bytesToMac(payload.subarray(0, 6)), deviceId: String(id) };
}
export function provisionPacket(identity: {deviceId: string; macId: string}, tx: {transactionId: string; challenge: string; deviceSecret: string; apimUrl: string}): Uint8Array {
  const payload = new Uint8Array(570);
  payload.set(macToBytes(identity.macId), 0);
  new DataView(payload.buffer).setUint32(6, deviceIdToNumber(identity.deviceId), true);
  payload.set(uuidBytes(tx.transactionId), 10);
  payload.set(hexBytes(tx.challenge, 32), 26);
  payload.set(fixedUtf8(tx.deviceSecret, 256), 58);
  payload.set(fixedUtf8(tx.apimUrl, 256), 314);
  return frame(PACKET.PROVISION, payload);
}
export function parseProvisionResponse(payload: Uint8Array): string {
  if (payload.length !== 33) throw new Error('Unexpected PROVISIONING_RESPONSE size');
  if (payload[0] !== 0) throw new Error(`Controller rejected provisioning (status 0x${payload[0].toString(16).padStart(2, '0')})`);
  if (payload.subarray(1).every(x => x === 0)) throw new Error('Controller returned an empty HMAC proof');
  return [...payload.subarray(1)].map(x => x.toString(16).padStart(2, '0')).join('');
}
