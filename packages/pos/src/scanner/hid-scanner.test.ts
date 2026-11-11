// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { scannerDeviceKey } from './device-identity';
import type { DeviceScannerSettings, ScannerProfileStore } from './device-scanner';
import { createHidScanner, HID_POS_USAGE_PAGE, type HidDeviceLike, type HidInputReportEventLike, type HidLike } from './hid-scanner';
import type { ScannerProfile } from './scanner-profiles';

const NOW = Date.UTC(2026, 10, 11, 9, 30);

// The same bytes hid-pos-decoder.test.ts builds: [length, ...ASCII data, symbologyId?].
function report(code: string, symbologyId?: number): number[] {
  const data = [...code].map((char) => char.charCodeAt(0));
  const bytes = [data.length, ...data];
  if (symbologyId !== undefined) bytes.push(symbologyId);
  return bytes;
}
const EAN13_REPORT = report('4006381333931', 0x0a);
const PLAIN_REPORT = report('12345678');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

/** A device with a real listener set. `log` is shared by open, close and removeEventListener, so it records their
 * order; `openGate` holds open() until it resolves. */
class FakeDevice implements HidDeviceLike {
  readonly log: string[] = [];
  readonly listeners = new Set<(event: HidInputReportEventLike) => void>();
  private isOpen = false;

  constructor(readonly vendorId: number, readonly productId: number, readonly productName?: string,
    private readonly openGate?: Promise<void>) {}

  open = vi.fn(async () => {
    this.log.push('open');
    // Catches a double open; whether the browser rejects this is not asserted here.
    if (this.isOpen) throw new DOMException('The device is already open.', 'InvalidStateError');
    this.isOpen = true;
    await this.openGate;
  });

  close = vi.fn(async () => {
    this.log.push('close');
    this.isOpen = false;
  });

  addEventListener = (_type: 'inputreport', listener: (event: HidInputReportEventLike) => void) => {
    this.listeners.add(listener);
  };

  removeEventListener = (_type: 'inputreport', listener: (event: HidInputReportEventLike) => void) => {
    this.log.push('remove');
    this.listeners.delete(listener);
  };

  fire = (bytes: number[], reportId = 0) => {
    for (const listener of [...this.listeners]) listener({ data: new DataView(Uint8Array.from(bytes).buffer), reportId });
  };
}

class FakeHid implements HidLike {
  granted: HidDeviceLike[] = [];
  private readonly queue: ({ devices: HidDeviceLike[] | Promise<HidDeviceLike[]> } | { error: unknown })[] = [];
  queueDevices = (devices: HidDeviceLike[] | Promise<HidDeviceLike[]>) => this.queue.push({ devices });
  queueError = (error: unknown) => this.queue.push({ error });
  requestDevice = vi.fn(async (_options: { filters: { usagePage?: number }[] }) => {
    const next = this.queue.shift();
    if (!next) throw new Error('no queued devices');
    if ('error' in next) throw next.error;
    return next.devices;
  });
  getDevices = vi.fn(async () => this.granted);
}

const hidKey = (vendorId: number, productId: number) => scannerDeviceKey({ connectionType: 'hid-pos', vendorId, productId });

function savedProfile(vendorId: number, productId: number): ScannerProfile {
  return { deviceKey: hidKey(vendorId, productId), connectionType: 'hid-pos', deviceName: '', vendorId, productId };
}

function setup({ profiles = [] as ScannerProfile[], settings = {} as Partial<DeviceScannerSettings>, noHid = false } = {}) {
  const hid = new FakeHid();
  const rows = new Map(profiles.map((profile) => [profile.deviceKey, profile]));
  const store = {
    read: vi.fn<ScannerProfileStore['read']>(async (types) => [...rows.values()].filter((row) => types.includes(row.connectionType))),
    save: vi.fn<ScannerProfileStore['save']>(async (profile) => { rows.set(profile.deviceKey, profile); }),
  };
  const emit = vi.fn();
  const onError = vi.fn();
  const scanner = createHidScanner({
    hid: noHid ? undefined : hid, profiles: store, emit, onError, now: () => NOW,
    getSettings: () => ({ prefix: '', suffix: '', minChars: 3, ...settings }),
  });
  return { hid, store, emit, onError, scanner };
}

async function connected(settings: Partial<DeviceScannerSettings> = {}) {
  const harness = setup({ settings });
  const device = new FakeDevice(1234, 5678, 'Scanner X');
  harness.hid.queueDevices([device]);
  await harness.scanner.connect();
  return { ...harness, device };
}

describe('createHidScanner: WCPOS v2 case', () => {
  it('leaves the stored device name empty when WebHID reports no product name', async () => {
    const { hid, store, scanner } = setup();
    hid.queueDevices([new FakeDevice(1234, 5678)]);
    await scanner.connect();
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ deviceName: '' }));
    await scanner.disconnect();
  });
});

describe('createHidScanner: reports', () => {
  it('decodes a report to one event, with symbology exactly when the decoder gives one', async () => {
    const { device, emit, hid } = await connected();
    expect(hid.requestDevice).toHaveBeenCalledWith({ filters: [{ usagePage: HID_POS_USAGE_PAGE }] });
    device.fire(EAN13_REPORT);
    device.fire(PLAIN_REPORT);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0]).toStrictEqual({ code: '4006381333931', symbology: 'ean13', source: { kind: 'hid-pos' }, timestamp: NOW });
    expect(emit.mock.calls[1][0]).toStrictEqual({ code: '12345678', source: { kind: 'hid-pos' }, timestamp: NOW });
  });

  it('decodes a report identically whatever its reportId, because the id is never prepended', async () => {
    // Two scanners, so the scan session's cooldown cannot hide the second read.
    const zero = await connected();
    const three = await connected();
    zero.device.fire(EAN13_REPORT, 0);
    three.device.fire(EAN13_REPORT, 3);
    expect(zero.emit).toHaveBeenCalledTimes(1);
    expect(three.emit).toHaveBeenCalledTimes(1);
    expect(three.emit.mock.calls[0][0]).toStrictEqual(zero.emit.mock.calls[0][0]);
    expect(zero.emit.mock.calls[0][0].code).toBe('4006381333931');
  });

  it('emits a repeat within the cooldown once', async () => {
    const { device, emit } = await connected();
    device.fire(PLAIN_REPORT);
    device.fire(PLAIN_REPORT);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('drops a code shorter than minChars', async () => {
    const { device, emit } = await connected({ minChars: 9 });
    device.fire(PLAIN_REPORT);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('createHidScanner: lifecycle', () => {
  it('removes the listener and then closes the device on disconnect', async () => {
    const { device, emit, scanner } = await connected();
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: hidKey(1234, 5678) });
    await scanner.disconnect();
    expect(device.log.slice(-2)).toEqual(['remove', 'close']);
    device.fire(PLAIN_REPORT);
    expect(emit).not.toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('closes the device a stale attach opened and keeps the newer one', async () => {
    const { hid, scanner } = setup();
    const gate = deferred<void>();
    const first = deferred<HidDeviceLike[]>();
    const second = deferred<HidDeviceLike[]>();
    const firstDevice = new FakeDevice(1, 2);
    const secondDevice = new FakeDevice(3, 4, undefined, gate.promise);
    hid.queueDevices(first.promise);
    hid.queueDevices(second.promise);
    const connects = [scanner.connect(), scanner.connect()];
    second.resolve([secondDevice]);
    await vi.waitFor(() => expect(secondDevice.log).toEqual(['open']));
    first.resolve([firstDevice]);
    await flush();
    gate.resolve();
    await Promise.all(connects);
    expect(secondDevice.log).toEqual(['open', 'close']);
    expect(secondDevice.listeners.size).toBe(0);
    expect(firstDevice.log).toEqual(['open']);
    expect(firstDevice.listeners.size).toBe(1);
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: hidKey(1, 2) });
  });

  it('reports connect failures to onError with the chooser-cancel flag and resolves', async () => {
    const { hid, onError, scanner } = setup();
    const cancel = new DOMException('No device selected', 'NotFoundError');
    hid.queueError(cancel);
    await expect(scanner.connect()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(cancel, { phase: 'connect', cancelled: true });
    const denied = new DOMException('Access denied', 'SecurityError');
    hid.queueError(denied);
    await expect(scanner.connect()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(denied, { phase: 'connect', cancelled: false });
    expect(scanner.getState().connected).toBe(false);
  });

  it('attaches and saves nothing, and reports nothing, when the chooser returns no device', async () => {
    const { hid, store, onError, scanner } = setup();
    hid.queueDevices([]);
    await expect(scanner.connect()).resolves.toBeUndefined();
    expect(store.save).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('saves the profile on the canonical hid-pos key', async () => {
    const { store } = await connected();
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save.mock.calls[0][0]).toStrictEqual({
      deviceKey: 'hid-pos:1234:5678', name: '', connectionType: 'hid-pos', deviceName: 'Scanner X', vendorId: 1234,
      productId: 5678, createdAt: new Date(NOW).toISOString(),
    });
  });

  it('reopens the first granted device matching a saved profile, without saving', async () => {
    const { hid, store, scanner } = setup({ profiles: [savedProfile(3, 4)] });
    const unsaved = new FakeDevice(1, 2);
    const saved = new FakeDevice(3, 4);
    hid.granted = [unsaved, saved];
    await scanner.reopenSaved();
    expect(unsaved.open).not.toHaveBeenCalled();
    expect(saved.log).toEqual(['open']);
    expect(saved.listeners.size).toBe(1);
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: hidKey(3, 4) });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('reopens nothing when no granted device matches a saved profile', async () => {
    const { hid, scanner } = setup({ profiles: [savedProfile(9, 9)] });
    const device = new FakeDevice(1, 2);
    hid.granted = [device];
    await scanner.reopenSaved();
    expect(device.open).not.toHaveBeenCalled();
    expect(scanner.getState().connected).toBe(false);
  });

  it('reports a failed reopen to onError as phase reopen', async () => {
    const { hid, onError, scanner } = setup();
    const failure = new Error('devices unavailable');
    hid.getDevices.mockRejectedValueOnce(failure);
    await expect(scanner.reopenSaved()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(failure, { phase: 'reopen', cancelled: false });
  });

  it('is unavailable and inert without WebHID', async () => {
    const { store, scanner } = setup({ noHid: true });
    expect(scanner.available).toBe(false);
    await expect(scanner.connect()).resolves.toBeUndefined();
    await expect(scanner.reopenSaved()).resolves.toBeUndefined();
    expect(store.read).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('disconnects on dispose and ignores every later connect or reopen', async () => {
    const { hid, device, scanner } = await connected();
    await scanner.dispose();
    expect(device.log).toEqual(['open', 'remove', 'close']);
    expect(scanner.getState().connected).toBe(false);
    hid.queueDevices([new FakeDevice(1, 2)]);
    await scanner.connect();
    await scanner.reopenSaved();
    expect(hid.requestDevice).toHaveBeenCalledTimes(1);
    expect(hid.getDevices).not.toHaveBeenCalled();
  });
});

describe('createHidScanner: reviewer mutations', () => {
  it('swallows a close error on disconnect', async () => {
    const { device, scanner } = await connected();
    device.close.mockRejectedValueOnce(new Error('close failed'));
    await expect(scanner.disconnect()).resolves.toBeUndefined();
    expect(device.close).toHaveBeenCalledTimes(1);
    expect(scanner.getState()).toEqual({ connected: false, connectedDeviceKey: null });
  });

  it('never opens a device whose attach went stale while the old device was closing', async () => {
    const { hid, device: a, scanner } = await connected();
    const gate = deferred<void>();
    a.close.mockImplementationOnce(async () => {
      a.log.push('close');
      await gate.promise;
    });
    const b = new FakeDevice(1, 2);
    const c = new FakeDevice(3, 4);
    hid.queueDevices([b]);
    hid.queueDevices([c]);
    const connectB = scanner.connect();
    await vi.waitFor(() => expect(a.log).toContain('close'));
    const connectC = scanner.connect();
    await vi.waitFor(() => expect(hid.requestDevice).toHaveBeenCalledTimes(3));
    await flush();
    gate.resolve();
    await Promise.all([connectB, connectC]);
    expect(b.log).not.toContain('open');
    expect(c.log).toEqual(['open']);
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: hidKey(3, 4) });
  });

  it('resets the scan session on a new attach, so a repeat after reconnecting is emitted again', async () => {
    const { hid, device, emit, scanner } = await connected();
    device.fire(PLAIN_REPORT);
    await scanner.disconnect();
    hid.queueDevices([device]);
    await scanner.connect();
    device.fire(PLAIN_REPORT);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('saves only the device that ended up attached when an attach goes stale', async () => {
    const { hid, store, scanner } = setup();
    const gate = deferred<void>();
    const first = deferred<HidDeviceLike[]>();
    const second = deferred<HidDeviceLike[]>();
    const firstDevice = new FakeDevice(1, 2);
    const secondDevice = new FakeDevice(3, 4, undefined, gate.promise);
    hid.queueDevices(first.promise);
    hid.queueDevices(second.promise);
    const connects = [scanner.connect(), scanner.connect()];
    second.resolve([secondDevice]);
    await vi.waitFor(() => expect(secondDevice.log).toEqual(['open']));
    first.resolve([firstDevice]);
    await flush();
    gate.resolve();
    await Promise.all(connects);
    expect(secondDevice.log).toEqual(['open', 'close']);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.save.mock.calls[0][0].deviceKey).toBe(hidKey(1, 2));
  });

  it('reopens the first of two granted devices that both match saved profiles', async () => {
    const { hid, scanner } = setup({ profiles: [savedProfile(1, 2), savedProfile(3, 4)] });
    const firstMatch = new FakeDevice(1, 2);
    const secondMatch = new FakeDevice(3, 4);
    hid.granted = [firstMatch, secondMatch];
    await scanner.reopenSaved();
    expect(firstMatch.log).toEqual(['open']);
    expect(secondMatch.open).not.toHaveBeenCalled();
    expect(scanner.getState()).toEqual({ connected: true, connectedDeviceKey: hidKey(1, 2) });
  });
});
