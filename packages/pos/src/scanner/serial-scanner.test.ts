// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { scannerDeviceKey, type ScannerIdentity } from './device-identity';
import type { DeviceScannerSettings, ScannerProfileStore } from './device-scanner';
import type { ScannerProfile } from './scanner-profiles';
import {
  createSerialScanner, serialPortIdentity, STANDARD_SPP_SERVICE_CLASS_ID, type SerialLike, type SerialPortInfoLike, type SerialPortLike,
} from './serial-scanner';

const STANDARD_SPP = '00001101-0000-1000-8000-00805f9b34fb';
const CUSTOM_SERVICE_CLASS = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const NOW = Date.UTC(2026, 10, 11, 9, 30);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

/** A port whose `readable` is a real WHATWG ReadableStream fed through its controller, so locking, getReader,
 * cancel and releaseLock are Node's own. `holdReadAfterCancel` parks the read loop after its reader is cancelled
 * until release(): the only ordering in which a replaced port's loop can outlive its replacement's open. */
class FakePort implements SerialPortLike {
  readonly log: string[] = [];
  readonly stream: ReadableStream<Uint8Array>;
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private isOpen = false;
  private readonly held = deferred<void>();

  constructor(private readonly info: SerialPortInfoLike, private readonly options: { holdReadAfterCancel?: boolean; openGate?: Promise<void> } = {}) {
    this.stream = new ReadableStream<Uint8Array>({ start: (controller) => { this.controller = controller; } });
    const getReader = this.stream.getReader.bind(this.stream);
    let cancelled = false;
    (this.stream as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }).getReader = () => {
      const reader = getReader();
      const cancel = reader.cancel.bind(reader);
      const read = reader.read.bind(reader);
      reader.cancel = (reason?: unknown) => {
        this.log.push('cancel');
        cancelled = true;
        return cancel(reason);
      };
      reader.read = async () => {
        const result = await read();
        if (cancelled && this.options.holdReadAfterCancel) await this.held.promise;
        return result;
      };
      return reader;
    };
  }

  get readable(): ReadableStream<Uint8Array> | null {
    return this.isOpen ? this.stream : null;
  }

  open = vi.fn(async () => {
    this.log.push('open');
    // Catches a double open; whether the browser rejects this is not asserted here.
    if (this.isOpen) throw new DOMException('The port is already open.', 'InvalidStateError');
    this.isOpen = true;
    await this.options.openGate;
  });

  close = vi.fn(async () => {
    this.log.push('close');
    this.isOpen = false;
  });

  getInfo = () => this.info;
  send = (chunk: string | number[]) => this.controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
  end = () => this.controller.close();
  release = () => this.held.resolve();
}

class FakeSerial implements SerialLike {
  granted: SerialPortLike[] = [];
  private readonly queue: ({ port: SerialPortLike | Promise<SerialPortLike> } | { error: unknown })[] = [];
  queuePort = (port: SerialPortLike | Promise<SerialPortLike>) => this.queue.push({ port });
  queueError = (error: unknown) => this.queue.push({ error });
  requestPort = vi.fn(async (_options?: { allowedBluetoothServiceClassIds?: string[] }) => {
    const next = this.queue.shift();
    if (!next) throw new Error('no queued port');
    if ('error' in next) throw next.error;
    return next.port;
  });
  getPorts = vi.fn(async () => this.granted);
}

function savedProfile(identity: ScannerIdentity): ScannerProfile {
  return {
    deviceKey: scannerDeviceKey(identity), connectionType: identity.connectionType, deviceName: '',
    ...('serviceUuid' in identity ? { serviceUuid: identity.serviceUuid } : {}),
    ...('vendorId' in identity ? { vendorId: identity.vendorId, productId: identity.productId } : {}),
  };
}

function setup({ profiles = [] as ScannerProfile[], settings = {} as Partial<DeviceScannerSettings>, noSerial = false } = {}) {
  const serial = new FakeSerial();
  const rows = new Map(profiles.map((profile) => [profile.deviceKey, profile]));
  const store = {
    read: vi.fn<ScannerProfileStore['read']>(async (types) => [...rows.values()].filter((row) => types.includes(row.connectionType))),
    save: vi.fn<ScannerProfileStore['save']>(async (profile) => { rows.set(profile.deviceKey, profile); }),
  };
  const emit = vi.fn();
  const onError = vi.fn();
  const scanner = createSerialScanner({
    serial: noSerial ? undefined : serial, profiles: store, emit, onError, now: () => NOW,
    getSettings: () => ({ prefix: '', suffix: '', minChars: 3, ...settings }),
  });
  return { serial, store, emit, onError, scanner };
}

const bluetooth = (serviceUuid: string): ScannerIdentity => ({ connectionType: 'bluetooth-spp', serviceUuid });
const usb = (vendorId: number, productId: number): ScannerIdentity => ({ connectionType: 'usb-serial', vendorId, productId });

describe('createSerialScanner: WCPOS v2 cases', () => {
  it('auto-reconnects a saved Bluetooth scanner by service class id', async () => {
    const { serial, store, scanner } = setup({ profiles: [savedProfile(bluetooth(CUSTOM_SERVICE_CLASS))] });
    const btPort = new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
    serial.granted = [btPort];
    await scanner.reopenSaved();
    expect(btPort.open).toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: scannerDeviceKey(bluetooth(CUSTOM_SERVICE_CLASS)) });
    // Silent re-open must not create a duplicate profile.
    expect(store.save).not.toHaveBeenCalled();
    await scanner.disconnect();
  });

  it('clears live device state when the active read stream ends', async () => {
    const { serial, scanner } = setup();
    const btPort = new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
    serial.queuePort(btPort);
    await scanner.connect();
    expect(scanner.getState().connected).toBe(true);
    btPort.end();
    await vi.waitFor(() => expect(scanner.getState().connected).toBe(false));
    expect(scanner.getState().connectedDeviceKey).toBeNull();
  });

  it('does not let a replaced port’s ending read loop clear the live state of its replacement', async () => {
    const { serial, scanner } = setup();
    const firstPort = new FakePort({ usbVendorId: 1, usbProductId: 2 }, { holdReadAfterCancel: true });
    const secondPort = new FakePort({ usbVendorId: 3, usbProductId: 4 });
    const secondKey = scannerDeviceKey(usb(3, 4));
    serial.queuePort(firstPort);
    await scanner.connect();
    expect(scanner.getState().connected).toBe(true);
    serial.queuePort(secondPort);
    await scanner.connect();
    expect(scanner.getState().connectedDeviceKey).toBe(secondKey);
    // The first loop finishes unwinding only now.
    firstPort.release();
    await vi.waitFor(() => expect(firstPort.stream.locked).toBe(false));
    await flush();
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: secondKey });
  });

  it('does not auto-reconnect when multiple granted Bluetooth ports share a service class', async () => {
    const { serial, scanner } = setup({ profiles: [savedProfile(bluetooth(CUSTOM_SERVICE_CLASS))] });
    const firstPort = new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
    const secondPort = new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
    serial.granted = [firstPort, secondPort];
    await scanner.reopenSaved();
    expect(firstPort.open).not.toHaveBeenCalled();
    expect(secondPort.open).not.toHaveBeenCalled();
  });

  it('does not auto-connect a granted Bluetooth port with no matching profile', async () => {
    const { serial, scanner } = setup({ profiles: [savedProfile(usb(1234, 5678))] });
    const btPort = new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
    serial.granted = [btPort];
    await scanner.reopenSaved();
    expect(btPort.open).not.toHaveBeenCalled();
  });

  it('requests ports with the standard SPP id plus saved custom service classes', async () => {
    const { serial, scanner } = setup({ profiles: [savedProfile(bluetooth(CUSTOM_SERVICE_CLASS))] });
    serial.queueError(new Error('cancelled'));
    await scanner.connect();
    expect(serial.requestPort).toHaveBeenCalledWith({
      allowedBluetoothServiceClassIds: expect.arrayContaining([STANDARD_SPP, CUSTOM_SERVICE_CLASS]),
    });
  });

  it('saves a Bluetooth port profile with its service class id', async () => {
    const { serial, store, scanner } = setup();
    serial.queuePort(new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS }));
    await scanner.connect();
    await vi.waitFor(() => expect(store.save).toHaveBeenCalledWith({
      deviceKey: scannerDeviceKey(bluetooth(CUSTOM_SERVICE_CLASS)), name: '', connectionType: 'bluetooth-spp',
      deviceName: '', vendorId: undefined, productId: undefined, serviceUuid: CUSTOM_SERVICE_CLASS,
      createdAt: expect.any(String),
    }));
  });

  it('re-registers an uppercase service class id onto the existing profile, not a second one', async () => {
    // The port reports the UUID uppercased while the saved profile holds it lowercased. The write is an upsert,
    // so what proves "no duplicate" is that it addresses the SAME deviceKey the saved profile already has.
    const deviceKey = scannerDeviceKey(bluetooth(CUSTOM_SERVICE_CLASS));
    const { serial, store, scanner } = setup({ profiles: [savedProfile(bluetooth(CUSTOM_SERVICE_CLASS))] });
    const btPort = new FakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS.toUpperCase() });
    serial.queuePort(btPort);
    await scanner.connect();
    await vi.waitFor(() => expect(btPort.open).toHaveBeenCalled());
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save.mock.calls[0][0].deviceKey).toBe(deviceKey);
    expect(store.save).toHaveBeenCalledWith({
      deviceKey, name: '', connectionType: 'bluetooth-spp', deviceName: '', vendorId: undefined, productId: undefined,
      serviceUuid: CUSTOM_SERVICE_CLASS, createdAt: expect.any(String),
    });
  });
});

describe('createSerialScanner: the pipeline', () => {
  async function connected(settings: Partial<DeviceScannerSettings> = {}) {
    const harness = setup({ settings });
    const port = new FakePort({ usbVendorId: 1234, usbProductId: 5678 });
    harness.serial.queuePort(port);
    await harness.scanner.connect();
    return { ...harness, port };
  }

  it('emits one event for a code split across chunks, timestamped by now', async () => {
    const { port, emit } = await connected();
    port.send('12345');
    await flush();
    expect(emit).not.toHaveBeenCalled();
    port.send('678\r\n');
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    expect(emit.mock.calls[0][0]).toStrictEqual({ code: '12345678', source: { kind: 'serial' }, timestamp: NOW });
  });

  it('decodes a multibyte character split between two chunks intact', async () => {
    const { port, emit } = await connected({ minChars: 1 });
    port.send([0x41, 0xc3]);
    port.send([0xa9, 0x42, 0x0d]);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    expect(emit.mock.calls[0][0].code).toBe('AéB');
  });

  it('drops a code shorter than minChars', async () => {
    const { port, emit } = await connected({ minChars: 8 });
    port.send('1234567\r');
    await flush();
    expect(emit).not.toHaveBeenCalled();
    port.send('12345678\r');
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    expect(emit.mock.calls[0][0].code).toBe('12345678');
  });
});

describe('createSerialScanner: lifecycle', () => {
  it('cancels the pending read and then closes the port on disconnect', async () => {
    const { serial, scanner } = setup();
    const port = new FakePort({ usbVendorId: 1234, usbProductId: 5678 });
    serial.queuePort(port);
    await scanner.connect();
    expect(port.stream.locked).toBe(true);
    await scanner.disconnect();
    expect(port.log).toEqual(['open', 'cancel', 'close']);
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('closes the port a stale attach opened and keeps the newer one', async () => {
    const { serial, scanner } = setup();
    const gate = deferred<void>();
    const first = deferred<SerialPortLike>();
    const second = deferred<SerialPortLike>();
    const firstPort = new FakePort({ usbVendorId: 1, usbProductId: 2 });
    const secondPort = new FakePort({ usbVendorId: 3, usbProductId: 4 }, { openGate: gate.promise });
    serial.queuePort(first.promise);
    serial.queuePort(second.promise);
    const connects = [scanner.connect(), scanner.connect()];
    second.resolve(secondPort);
    await vi.waitFor(() => expect(secondPort.log).toEqual(['open']));
    first.resolve(firstPort);
    await flush();
    gate.resolve();
    await Promise.all(connects);
    expect(secondPort.log).toEqual(['open', 'close']);
    expect(firstPort.log).toEqual(['open']);
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: scannerDeviceKey(usb(1, 2)) });
  });

  it('drops the old port’s partial line when a new port attaches', async () => {
    const { serial, emit, scanner } = setup({ settings: { minChars: 1 } });
    const portA = new FakePort({ usbVendorId: 1, usbProductId: 2 });
    const portB = new FakePort({ usbVendorId: 3, usbProductId: 4 });
    serial.queuePort(portA);
    await scanner.connect();
    portA.send('123');
    await flush();
    serial.queuePort(portB);
    await scanner.connect();
    portB.send('456\r');
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    await flush();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].code).toBe('456');
  });

  it('closes a port whose open was pending when disconnect was called, without saving it', async () => {
    const { serial, store, scanner } = setup();
    const gate = deferred<void>();
    const port = new FakePort({ usbVendorId: 1234, usbProductId: 5678 }, { openGate: gate.promise });
    serial.queuePort(port);
    const connecting = scanner.connect();
    await vi.waitFor(() => expect(port.log).toEqual(['open']));
    const disconnecting = scanner.disconnect();
    gate.resolve();
    await Promise.all([connecting, disconnecting]);
    expect(port.log).toEqual(['open', 'close']);
    expect(store.save).not.toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('identifies a USB port only when both ids are present, ahead of a Bluetooth class', () => {
    expect(serialPortIdentity({ usbVendorId: 1 })).toBeNull();
    expect(serialPortIdentity({})).toBeNull();
    expect(serialPortIdentity({ usbVendorId: 1, usbProductId: 2, bluetoothServiceClassId: STANDARD_SPP }))
      .toEqual({ connectionType: 'usb-serial', vendorId: 1, productId: 2 });
  });

  it('reports connect failures to onError with the chooser-cancel flag and resolves', async () => {
    const { serial, onError, scanner } = setup();
    const cancel = new DOMException('No port selected', 'NotFoundError');
    serial.queueError(cancel);
    await expect(scanner.connect()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(cancel, { phase: 'connect', cancelled: true });
    const denied = new DOMException('Access denied', 'SecurityError');
    serial.queueError(denied);
    await expect(scanner.connect()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(denied, { phase: 'connect', cancelled: false });
    expect(scanner.getState().connected).toBe(false);
  });

  it('reports a failed reopen to onError as phase reopen', async () => {
    const { serial, onError, scanner } = setup();
    const failure = new Error('ports unavailable');
    serial.getPorts.mockRejectedValueOnce(failure);
    await expect(scanner.reopenSaved()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(failure, { phase: 'reopen', cancelled: false });
  });

  it('saves a USB port without a serviceUuid key', async () => {
    const { serial, store, scanner } = setup();
    serial.queuePort(new FakePort({ usbVendorId: 1234, usbProductId: 5678 }));
    await scanner.connect();
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save.mock.calls[0][0]).toStrictEqual({
      deviceKey: 'usb-serial:1234:5678', name: '', connectionType: 'usb-serial', deviceName: '', vendorId: 1234,
      productId: 5678, createdAt: new Date(NOW).toISOString(),
    });
  });

  it('deduplicates the chooser allowlist and skips empty saved UUIDs', async () => {
    const empty: ScannerProfile = { deviceKey: 'bluetooth-spp:', connectionType: 'bluetooth-spp', deviceName: '', serviceUuid: '' };
    const { serial, scanner } = setup({
      profiles: [savedProfile(bluetooth(STANDARD_SPP)), savedProfile(bluetooth(CUSTOM_SERVICE_CLASS)), empty],
    });
    serial.queueError(new DOMException('No port selected', 'NotFoundError'));
    await scanner.connect();
    expect(serial.requestPort).toHaveBeenCalledWith({ allowedBluetoothServiceClassIds: [STANDARD_SPP_SERVICE_CLASS_ID, CUSTOM_SERVICE_CLASS] });
  });

  it('is unavailable and inert without Web Serial', async () => {
    const { store, scanner } = setup({ noSerial: true });
    expect(scanner.available).toBe(false);
    await expect(scanner.connect()).resolves.toBeUndefined();
    await expect(scanner.reopenSaved()).resolves.toBeUndefined();
    expect(store.read).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('disconnects on dispose and ignores every later connect or reopen', async () => {
    const { serial, scanner } = setup();
    const port = new FakePort({ usbVendorId: 1234, usbProductId: 5678 });
    serial.queuePort(port);
    await scanner.connect();
    await scanner.dispose();
    expect(port.log).toEqual(['open', 'cancel', 'close']);
    expect(scanner.getState().connected).toBe(false);
    serial.queuePort(new FakePort({ usbVendorId: 1, usbProductId: 2 }));
    await scanner.connect();
    await scanner.reopenSaved();
    expect(serial.requestPort).toHaveBeenCalledTimes(1);
    expect(serial.getPorts).not.toHaveBeenCalled();
  });
});
