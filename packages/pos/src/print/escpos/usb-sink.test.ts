// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEscPosTransport, createWebUsbSink, PrintError, type PrinterProfile, type WebUsbDevice } from '../index';

type Endpoint = { endpointNumber: number; direction: 'in' | 'out'; type: 'bulk' | 'interrupt' | 'isochronous' };
// interfaces: one endpoint list per interface number, default interface 0 with bulk OUT endpoint 2.
// statuses: each transferOut's status in turn, default 'ok'.
interface FakeOptions {
  opened?: boolean; configured?: boolean; claimed?: number[]; openError?: Error; clearHaltError?: Error;
  interfaces?: Endpoint[][]; statuses?: ('ok' | 'stall' | 'babble')[];
}

// Enforces what Chromium's WebUSB enforces: configuring and claiming need an open device, a transfer needs its
// interface claimed, and a stalled endpoint stays halted until clearHalt. open() leaves configuration null until
// selectConfiguration(1) sets it.
function fakeDevice(options: FakeOptions = {}) {
  const calls: string[] = [];
  const transfers: Uint8Array[] = [];
  const halted = new Set<number>();
  const interfaces = (options.interfaces ?? [[{ endpointNumber: 2, direction: 'out', type: 'bulk' }]]).map(
    (endpoints, interfaceNumber) => ({ interfaceNumber, claimed: options.claimed?.includes(interfaceNumber) ?? false, alternate: { endpoints } }),
  );
  const configuration = { interfaces };
  const device = {
    productName: 'Counter printer',
    opened: options.opened ?? false,
    configuration: options.configured ? configuration : null as typeof configuration | null,
    async open() {
      calls.push('open');
      if (options.openError) throw options.openError;
      device.opened = true;
    },
    async selectConfiguration(value: number) {
      calls.push(`selectConfiguration(${value})`);
      if (!device.opened || value !== 1) throw new Error('InvalidStateError');
      device.configuration = configuration;
    },
    async claimInterface(interfaceNumber: number) {
      calls.push(`claimInterface(${interfaceNumber})`);
      const target = device.opened ? device.configuration?.interfaces[interfaceNumber] : undefined;
      if (!target) throw new Error('InvalidStateError');
      target.claimed = true;
    },
    async clearHalt(direction: 'in' | 'out', endpointNumber: number) {
      calls.push(`clearHalt(${direction},${endpointNumber})`);
      if (!device.opened) throw new Error('InvalidStateError');
      if (options.clearHaltError) throw options.clearHaltError;
      if (direction === 'out') halted.delete(endpointNumber);
    },
    async transferOut(endpointNumber: number, data: Uint8Array<ArrayBuffer>) {
      calls.push(`transferOut(${endpointNumber})`);
      const owns = ({ alternate }: (typeof interfaces)[number]) => alternate.endpoints.some((endpoint) => endpoint.endpointNumber === endpointNumber && endpoint.direction === 'out');
      const owner = device.configuration?.interfaces.find(owns);
      if (!device.opened || !owner?.claimed) throw new Error('InvalidStateError');
      if (halted.has(endpointNumber)) return { status: 'stall' as const, bytesWritten: 0 };
      transfers.push(data.slice());
      const status = options.statuses?.[transfers.length - 1] ?? 'ok';
      if (status === 'stall') halted.add(endpointNumber);
      return { status, bytesWritten: status === 'ok' ? data.length : 0 };
    },
  } satisfies WebUsbDevice;
  return { device, calls, transfers };
}

const bytesOf = (length: number) => Uint8Array.from({ length }, (_, i) => i % 251);
const joined = (parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));

async function rejection(promise: Promise<unknown>): Promise<PrintError> {
  const error = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(PrintError);
  return error as PrintError;
}

describe('createWebUsbSink', () => {
  it('U0: the fake rejects claiming before open and transferring before claim', async () => {
    const { device } = fakeDevice();
    await expect(device.claimInterface(0)).rejects.toThrow();
    await device.open();
    await device.selectConfiguration(1);
    await expect(device.transferOut(2, new Uint8Array([1]))).rejects.toThrow();
  });

  it('U1: opens, configures and claims a closed device, then writes the bytes', async () => {
    const { device, calls, transfers } = fakeDevice();
    const bytes = new Uint8Array([0x1b, 0x40, 0x41, 0x0a]);
    await createWebUsbSink({ device }).write(bytes);
    expect(calls).toEqual(['open', 'selectConfiguration(1)', 'claimInterface(0)', 'transferOut(2)']);
    expect(transfers).toEqual([bytes]);
  });

  it('U2: an open, configured, claimed device only transfers', async () => {
    const { device, calls } = fakeDevice({ opened: true, configured: true, claimed: [0] });
    await createWebUsbSink({ device }).write(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual(['transferOut(2)']);
  });

  it('U3: writes in 4096-byte transfers by default, or chunkSize', async () => {
    const bytes = bytesOf(10_000);
    const first = fakeDevice();
    await createWebUsbSink({ device: first.device }).write(bytes);
    expect(first.transfers.map((part) => part.length)).toEqual([4096, 4096, 1808]);
    expect(joined(first.transfers)).toEqual(bytes);
    const second = fakeDevice();
    await createWebUsbSink({ device: second.device, chunkSize: 1000 }).write(bytes);
    expect(second.transfers).toHaveLength(10);
    expect(joined(second.transfers)).toEqual(bytes);
  });

  it('U4: claims the first interface with a bulk OUT endpoint', async () => {
    const { device, calls } = fakeDevice({ interfaces: [
      [{ endpointNumber: 1, direction: 'in', type: 'bulk' }, { endpointNumber: 2, direction: 'out', type: 'interrupt' }],
      [{ endpointNumber: 3, direction: 'out', type: 'bulk' }],
    ] });
    await createWebUsbSink({ device }).write(new Uint8Array([1]));
    expect(calls).toEqual(['open', 'selectConfiguration(1)', 'claimInterface(1)', 'transferOut(3)']);
  });

  it('U5: no bulk OUT endpoint is unsupported, and nothing is claimed or sent', async () => {
    const { device, calls } = fakeDevice({ interfaces: [[{ endpointNumber: 1, direction: 'in', type: 'bulk' }]] });
    const error = await rejection(createWebUsbSink({ device }).write(new Uint8Array([1])));
    expect(error.code).toBe('unsupported');
    expect(error.message).toContain('Counter printer');
    expect(calls.filter((call) => /^(claimInterface|transferOut)/.test(call))).toEqual([]);
  });

  it('U6: a stalled transfer fails and sends no further chunk', async () => {
    const { device, calls } = fakeDevice({ statuses: ['ok', 'stall'] });
    const error = await rejection(createWebUsbSink({ device }).write(bytesOf(10_000)));
    expect(error.code).toBe('failed');
    expect(error.message).toContain('stall');
    expect(calls.filter((call) => call.startsWith('transferOut'))).toHaveLength(2);
    expect(calls.slice(-2)).toEqual(['transferOut(2)', 'clearHalt(out,2)']);
  });

  it('U7: a rejected open fails with the cause and the device name', async () => {
    const busy = new Error('busy');
    const { device } = fakeDevice({ openError: busy });
    const error = await rejection(createWebUsbSink({ device }).write(new Uint8Array([1])));
    expect(error.code).toBe('failed');
    expect(error.cause).toBe(busy);
    expect(error.message).toContain('Counter printer');
  });

  it('U8: a bytes job reaches transferOut unchanged through createEscPosTransport', async () => {
    const { device, transfers } = fakeDevice();
    const profile: PrinterProfile = { id: 'usb-1', name: 'Counter', connectionType: 'usb' };
    const bytes = new Uint8Array([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x1d, 0x56, 0x00]);
    await createEscPosTransport({ sink: createWebUsbSink({ device }), profile }).print({ id: 'job-1', kind: 'test', bytes });
    expect(transfers).toEqual([bytes]);
  });

  it('U9: a stall clears the halt, so the next write on the same device prints', async () => {
    const { device, transfers } = fakeDevice({ statuses: ['stall'] });
    const sink = createWebUsbSink({ device });
    expect((await rejection(sink.write(new Uint8Array([1])))).code).toBe('failed');
    const bytes = new Uint8Array([0x1b, 0x40, 0x0a]);
    await sink.write(bytes);
    expect(transfers.at(-1)).toEqual(bytes);
  });

  it('U10: a rejected clearHalt does not replace the stall failure', async () => {
    const { device, calls } = fakeDevice({ statuses: ['stall'], clearHaltError: new Error('gone') });
    const error = await rejection(createWebUsbSink({ device }).write(new Uint8Array([1])));
    expect(calls).toContain('clearHalt(out,2)');
    expect(error.code).toBe('failed');
    expect(error.message).toContain('stall');
    expect(error.message).not.toContain('gone');
  });

  it('U11: chunkSize must be a positive integer', () => {
    const { device } = fakeDevice();
    for (const chunkSize of [0, -1, 1.5]) expect(() => createWebUsbSink({ device, chunkSize })).toThrow(RangeError);
  });
});
