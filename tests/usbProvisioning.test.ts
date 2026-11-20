import { afterEach, expect, test, vi } from 'vitest';
import {
  frame,
  helloPacket,
  PACKET,
  provisionPacket,
  provisioningConfirmationPacket,
} from '../src/services/busbarPacketProtocol';
import {
  APIM_VOLTAGE_URL,
  createUsbProvisioningSession,
  type UsbPort,
} from '../src/services/usbProvisioning';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockController() {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const writes: Uint8Array[] = [];
  const port: UsbPort = {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    readable: new ReadableStream({
      start(controller) {
        input = controller;
      },
    }),
    writable: new WritableStream({
      write(bytes) {
        writes.push(bytes.slice());
      },
    }),
  };
  return { port, writes, reply: (bytes: Uint8Array) => input.enqueue(bytes) };
}

function helloResponse(deviceId: number) {
  const payload = new Uint8Array([2, 75, 179, 185, 235, 229, 0, 0, 0, 0]);
  new DataView(payload.buffer).setUint32(6, deviceId, true);
  return frame(PACKET.HELLO_RESPONSE, payload);
}

test('keeps fragmented and buffered replies independent between sessions', async () => {
  const first = mockController();
  const second = mockController();
  vi.stubGlobal('navigator', {
    serial: {
      requestPort: vi.fn().mockResolvedValueOnce(first.port).mockResolvedValueOnce(second.port),
    },
  });
  const firstSession = createUsbProvisioningSession();
  const secondSession = createUsbProvisioningSession();
  await firstSession.connect();
  await secondSession.connect();
  const response = helloResponse(1);
  first.reply(Uint8Array.of(99, 98, ...response.slice(0, 2)));
  first.reply(Uint8Array.of(...response.slice(2), ...helloResponse(3)));
  second.reply(helloResponse(2));
  expect(await firstSession.hello()).toEqual({ deviceId: '1', macId: '02:4B:B3:B9:EB:E5' });
  expect(await secondSession.hello()).toEqual({ deviceId: '2', macId: '02:4B:B3:B9:EB:E5' });
  expect(await firstSession.hello()).toEqual({ deviceId: '3', macId: '02:4B:B3:B9:EB:E5' });
  expect(first.writes).toEqual([helloPacket(), helloPacket()]);
  expect(first.port.open).toHaveBeenCalledWith({
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  });
  await firstSession.close();
  expect(first.port.readable?.locked).toBe(false);
  expect(first.port.writable?.locked).toBe(false);
  expect(first.port.close).toHaveBeenCalledOnce();
  await expect(firstSession.hello()).rejects.toThrow('Serial port disconnected.');
  await secondSession.close();
});

test('preserves provisioning validation, proof parsing, and confirmation bytes', async () => {
  const controller = mockController();
  vi.stubGlobal('navigator', { serial: { requestPort: async () => controller.port } });
  const session = createUsbProvisioningSession();
  await session.connect();
  const identity = { deviceId: '1', macId: '02:4B:B3:B9:EB:E5' };
  const transaction = {
    transactionId: '12345678-1234-1234-1234-123456789abc',
    challenge: 'a'.repeat(64),
    deviceSecret: 'b'.repeat(43),
    apimUrl: APIM_VOLTAGE_URL,
  };
  await expect(session.provision(identity, { ...transaction, deviceSecret: '' })).rejects.toThrow(
    'Unexpected provisioning parameters',
  );
  expect(controller.writes).toHaveLength(0);
  controller.reply(
    frame(PACKET.PROVISION_RESPONSE, Uint8Array.of(0, ...new Uint8Array(32).fill(17))),
  );
  expect(await session.provision(identity, transaction)).toBe('11'.repeat(32));
  await session.sendProvisioningConfirmation(true);
  await session.sendProvisioningConfirmation(false);
  expect(controller.writes).toEqual([
    provisionPacket(identity, transaction),
    provisioningConfirmationPacket(true),
    provisioningConfirmationPacket(false),
  ]);
  await session.close();
});

test.each(['crc', 'code', 'length', 'disconnect', 'timeout'])(
  'preserves %s failures and permits cleanup',
  async (failure) => {
    vi.useFakeTimers();
    const controller = mockController();
    vi.stubGlobal('navigator', { serial: { requestPort: async () => controller.port } });
    const session = createUsbProvisioningSession();
    await session.connect();
    let message: string;
    if (failure === 'crc') {
      const reply = helloResponse(1);
      reply[reply.length - 1] ^= 1;
      controller.reply(reply);
      message = 'CRC mismatch';
    } else if (failure === 'code') {
      controller.reply(frame(PACKET.PROVISION_RESPONSE, new Uint8Array(0)));
      message = 'Unexpected controller packet';
    } else if (failure === 'length') {
      controller.reply(Uint8Array.of(2, 1, 0));
      message = 'Invalid controller packet length';
    } else if (failure === 'disconnect') {
      await session.close();
      message = 'Serial port disconnected';
    } else {
      message = 'Controller response timed out';
    }
    const assertion = expect(session.hello()).rejects.toThrow(message);
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(6000);
    await assertion;
    await session.close();
    expect(controller.port.readable?.locked).toBe(false);
    expect(controller.port.writable?.locked).toBe(false);
  },
);
