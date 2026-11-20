// TEST ONLY: mock controller, COM4, newline-delimited JSON protocol.
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const portName = process.argv[2] || 'COM4';
const port = new SerialPort({
  path: portName,
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
});
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
const configPath = path.join(__dirname, '.mock-device-config.json');
const identity = {
  deviceId: process.env.MOCK_DEVICE_ID || 'TEST-USB-002',
  macId: process.env.MOCK_MAC_ID || '02:4B:B3:B9:EB:E6',
};
function send(data) {
  port.write(JSON.stringify(data) + '\n', (err) => {
    if (err) console.error('Serial write failed:', err.message);
  });
}
port.on('open', () => console.log(`Mock controller listening on ${portName} (9600 8N1)`));
port.on('error', (err) => console.error('Serial error:', err.message));
parser.on('data', (line) => {
  let msg;
  try {
    msg = JSON.parse(line.trim());
  } catch {
    return;
  }
  if (msg.command === 'HELLO') {
    send({ command: 'HELLO_ACK', ...identity });
    console.log('Sent HELLO_ACK');
    return;
  }
  if (msg.command === 'VERIFY_CHALLENGE') {
    try {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (
        msg.deviceId !== identity.deviceId ||
        msg.transactionId !== saved.transactionId ||
        typeof msg.challenge !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(msg.challenge)
      )
        throw Error('Invalid challenge');
      const canonical = [
        'BUSBAR-PROVISION-V1',
        saved.deviceId,
        saved.macId,
        saved.transactionId,
        msg.challenge,
      ].join('\n');
      const proof = crypto
        .createHmac('sha256', saved.deviceSecret)
        .update(canonical, 'utf8')
        .digest('hex');
      send({
        command: 'VERIFY_RESPONSE',
        deviceId: saved.deviceId,
        transactionId: saved.transactionId,
        proof,
      });
      console.log('Returned provisioning HMAC proof.');
    } catch {
      send({ command: 'ERROR', message: 'Unable to verify stored credentials' });
    }
    return;
  }
  if (msg.command !== 'PROVISION') return;
  if (
    msg.deviceId !== identity.deviceId ||
    msg.macId !== identity.macId ||
    typeof msg.url !== 'string' ||
    !msg.url.startsWith('https://') ||
    typeof msg.deviceSecret !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(msg.deviceSecret) ||
    typeof msg.transactionId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(msg.transactionId)
  ) {
    send({ command: 'ERROR', message: 'Invalid provisioning packet' });
    return;
  }
  try {
    // TEST ONLY. Real firmware must use protected nonvolatile storage.
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        deviceId: msg.deviceId,
        macId: msg.macId,
        url: msg.url,
        deviceSecret: msg.deviceSecret,
        transactionId: msg.transactionId,
      }),
      { mode: 0o600, flag: 'w' },
    );
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (saved.deviceSecret !== msg.deviceSecret)
      throw new Error('Configuration verification failed');
    send({
      command: 'PROVISION_ACK',
      deviceId: msg.deviceId,
      transactionId: msg.transactionId,
      status: 'SAVED',
    });
    console.log('Provisioning saved and acknowledged (secret not logged).');
  } catch (e) {
    console.error('Provisioning save failed:', e.message);
    send({ command: 'ERROR', message: 'Unable to save configuration' });
  }
});
