// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLUETOOTH_PRINT_SERVICES, createEscPosTransport, createWebBluetoothSink, PrintError, type PrinterProfile, type WebBluetoothDevice,
} from '../index';

// The four print profiles (service, write characteristic), in the sink's probe order.
const P1 = ['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'] as const;
const P2 = ['0000ff00-0000-1000-8000-00805f9b34fb', '0000ff02-0000-1000-8000-00805f9b34fb'] as const;
const P3 = ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'] as const;
const P4 = ['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'] as const;

type Properties = { write: boolean; writeWithoutResponse: boolean };
interface FakeProfile { service: string; characteristic: string; properties: Properties }
// profiles: the services the device has, default P1 with write and writeWithoutResponse.
// failChunk: the 1-based chunk whose write rejects.
interface FakeOptions { profiles?: FakeProfile[]; connected?: boolean; connectError?: Error; failChunk?: number }

const profile = ([service, characteristic]: readonly [string, string], properties: Properties = { write: true, writeWithoutResponse: true }) => (
  { service, characteristic, properties }
);

// Enforces what Chromium's Web Bluetooth enforces: services and writes need a connected server, a missing service or
// characteristic rejects, and each write kind needs its characteristic property.
function fakeDevice(options: FakeOptions = {}) {
  const calls: string[] = [];
  const writes: { characteristic: string; response: boolean; bytes: Uint8Array }[] = [];
  const profiles = options.profiles ?? [profile(P1)];
  let chunks = 0;
  const characteristicOf = ({ characteristic, properties }: FakeProfile) => {
    const write = async (response: boolean, value: Uint8Array<ArrayBuffer>) => {
      calls.push(`${response ? 'writeValueWithResponse' : 'writeValueWithoutResponse'}(${value.length})`);
      if (!gatt.connected) throw new Error('NetworkError: GATT Server is disconnected');
      if (!(response ? properties.write : properties.writeWithoutResponse)) throw new Error('NotSupportedError');
      if (++chunks === options.failChunk) throw new Error('NetworkError: GATT operation failed');
      writes.push({ characteristic, response, bytes: value.slice() });
    };
    return {
      properties,
      writeValueWithResponse: (value: Uint8Array<ArrayBuffer>) => write(true, value),
      writeValueWithoutResponse: (value: Uint8Array<ArrayBuffer>) => write(false, value),
    };
  };
  const gatt = {
    connected: options.connected ?? false,
    async connect() {
      calls.push('connect');
      if (options.connectError) throw options.connectError;
      gatt.connected = true;
      return gatt;
    },
    async getPrimaryService(service: string) {
      calls.push(`getPrimaryService(${service})`);
      if (!gatt.connected) throw new Error('NetworkError: GATT Server is disconnected');
      const matches = profiles.filter((entry) => entry.service === service);
      if (matches.length === 0) throw new Error('NotFoundError: no such service');
      return {
        async getCharacteristic(characteristic: string) {
          calls.push(`getCharacteristic(${characteristic})`);
          const match = matches.find((entry) => entry.characteristic === characteristic);
          if (!match) throw new Error('NotFoundError: no such characteristic');
          return characteristicOf(match);
        },
      };
    },
  };
  const device = { name: 'Counter BLE', gatt } satisfies WebBluetoothDevice;
  return { device, calls, writes };
}

const bytesOf = (length: number) => Uint8Array.from({ length }, (_, i) => i % 251);
const joined = (parts: { bytes: Uint8Array }[]) => Uint8Array.from(parts.flatMap(({ bytes }) => [...bytes]));
const writeCalls = (calls: string[]) => calls.filter((call) => call.startsWith('writeValue'));

// Runs a write through its pauses on fake time; resolves to the rejection, or undefined.
async function drive(promise: Promise<void>): Promise<unknown> {
  const outcome = promise.then(() => undefined, (reason: unknown) => reason);
  await vi.advanceTimersByTimeAsync(5_000);
  return outcome;
}

async function rejection(promise: Promise<void>): Promise<PrintError> {
  const error = await drive(promise);
  expect(error).toBeInstanceOf(PrintError);
  return error as PrintError;
}

describe('createWebBluetoothSink', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('B0: the fake rejects services before connect and a write kind the characteristic lacks', async () => {
    const { device } = fakeDevice({ profiles: [profile(P1, { write: true, writeWithoutResponse: false })] });
    await expect(device.gatt.getPrimaryService(P1[0])).rejects.toThrow();
    await device.gatt.connect();
    const characteristic = await (await device.gatt.getPrimaryService(P1[0])).getCharacteristic(P1[1]);
    await expect(characteristic.writeValueWithoutResponse(new Uint8Array([1]))).rejects.toThrow();
  });

  it('B1: connects, finds 18F0/2AF1 and writes 20-byte chunks, the last with response', async () => {
    const { device, calls, writes } = fakeDevice();
    const bytes = bytesOf(45);
    expect(await drive(createWebBluetoothSink({ device }).write(bytes))).toBeUndefined();
    expect(calls).toEqual([
      'connect', `getPrimaryService(${P1[0]})`, `getCharacteristic(${P1[1]})`,
      'writeValueWithoutResponse(20)', 'writeValueWithoutResponse(20)', 'writeValueWithResponse(5)',
    ]);
    expect(joined(writes)).toEqual(bytes);
  });

  it('B2: waits 20 ms between chunks and 300 ms after the last', async () => {
    const { device, calls } = fakeDevice();
    let resolved = false;
    const done = createWebBluetoothSink({ device }).write(bytesOf(45)).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(writeCalls(calls)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(19);
    expect(writeCalls(calls)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(writeCalls(calls)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(writeCalls(calls)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(299);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    await done;
  });

  it('B3: a connected device is not connected again', async () => {
    const { device, calls } = fakeDevice({ connected: true });
    await drive(createWebBluetoothSink({ device }).write(bytesOf(3)));
    expect(calls).not.toContain('connect');
    expect(writeCalls(calls)).toEqual(['writeValueWithResponse(3)']);
  });

  it('B4: probes the profiles in order and writes to the first the device has', async () => {
    const { device, calls, writes } = fakeDevice({ profiles: [profile(P3)] });
    expect(await drive(createWebBluetoothSink({ device }).write(bytesOf(5)))).toBeUndefined();
    expect(calls.filter((call) => call.startsWith('getPrimaryService'))).toEqual([P1, P2, P3].map(([service]) => `getPrimaryService(${service})`));
    expect(writes.map(({ characteristic }) => characteristic)).toEqual([P3[1]]);
  });

  it('B5: skips a characteristic without write', async () => {
    const { device, writes } = fakeDevice({ profiles: [profile(P1, { write: false, writeWithoutResponse: true }), profile(P2)] });
    expect(await drive(createWebBluetoothSink({ device }).write(bytesOf(5)))).toBeUndefined();
    expect(writes.map(({ characteristic }) => characteristic)).toEqual([P2[1]]);
  });

  it('B6: no known print service, or no GATT server, is unsupported and writes nothing', async () => {
    const { device, calls } = fakeDevice({ profiles: [profile(['0000180a-0000-1000-8000-00805f9b34fb', P1[1]])] });
    const error = await rejection(createWebBluetoothSink({ device }).write(bytesOf(5)));
    expect(error.code).toBe('unsupported');
    expect(error.message).toContain('Counter BLE');
    expect(writeCalls(calls)).toEqual([]);
    for (const bare of [{ name: 'Bare', gatt: null }, { name: 'Bare' }] satisfies WebBluetoothDevice[]) {
      expect((await rejection(createWebBluetoothSink({ device: bare }).write(bytesOf(5)))).code).toBe('unsupported');
    }
  });

  it('B7: a characteristic without writeWithoutResponse gets every chunk with response', async () => {
    const { device, calls } = fakeDevice({ profiles: [profile(P1, { write: true, writeWithoutResponse: false })] });
    expect(await drive(createWebBluetoothSink({ device }).write(bytesOf(45)))).toBeUndefined();
    expect(writeCalls(calls)).toEqual(['writeValueWithResponse(20)', 'writeValueWithResponse(20)', 'writeValueWithResponse(5)']);
  });

  it('B8: a rejected connect or chunk fails with the cause, and no later chunk is written', async () => {
    const outOfRange = new Error('out of range');
    const first = fakeDevice({ connectError: outOfRange });
    const error = await rejection(createWebBluetoothSink({ device: first.device }).write(bytesOf(5)));
    expect(error.code).toBe('failed');
    expect(error.cause).toBe(outOfRange);
    expect(error.message).toContain('Counter BLE');
    const second = fakeDevice({ failChunk: 2 });
    expect((await rejection(createWebBluetoothSink({ device: second.device }).write(bytesOf(45)))).code).toBe('failed');
    expect(writeCalls(second.calls)).toHaveLength(2);
  });

  it('B9: a second write after a disconnect reconnects and probes again', async () => {
    const { device, calls, writes } = fakeDevice();
    const sink = createWebBluetoothSink({ device });
    await drive(sink.write(bytesOf(5)));
    device.gatt.connected = false;
    calls.length = 0;
    expect(await drive(sink.write(bytesOf(5)))).toBeUndefined();
    expect(calls).toEqual(['connect', `getPrimaryService(${P1[0]})`, `getCharacteristic(${P1[1]})`, 'writeValueWithResponse(5)']);
    expect(writes).toHaveLength(2);
  });

  it('B10: chunkSize must be a positive integer, and sets the bytes per write', async () => {
    const { device, calls } = fakeDevice();
    for (const chunkSize of [0, -1, 1.5]) expect(() => createWebBluetoothSink({ device, chunkSize })).toThrow(RangeError);
    expect(await drive(createWebBluetoothSink({ device, chunkSize: 100 }).write(bytesOf(45)))).toBeUndefined();
    expect(writeCalls(calls)).toEqual(['writeValueWithResponse(45)']);
  });

  it('B11: a bytes job reaches the writes unchanged through createEscPosTransport', async () => {
    const { device, writes } = fakeDevice();
    const printer: PrinterProfile = { id: 'ble-1', name: 'Counter', connectionType: 'bluetooth' };
    const bytes = new Uint8Array([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x1d, 0x56, 0x00]);
    const transport = createEscPosTransport({ sink: createWebBluetoothSink({ device }), profile: printer });
    expect(await drive(transport.print({ id: 'job-1', kind: 'test', bytes }))).toBeUndefined();
    expect(joined(writes)).toEqual(bytes);
  });

  it('B12: BLUETOOTH_PRINT_SERVICES lists the four services in probe order', () => {
    expect(BLUETOOTH_PRINT_SERVICES).toEqual([P1[0], P2[0], P3[0], P4[0]]);
  });
});
