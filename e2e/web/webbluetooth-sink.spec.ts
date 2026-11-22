// Real-browser proof for the Web Bluetooth ESC/POS sink (packages/pos/src/print/escpos/bluetooth-sink.ts). The unit
// tests' fake stands in for a BluetoothDevice; this proves in Chromium that the real Web Bluetooth interfaces carry
// every member name the sink's `WebBluetoothDevice` type uses, and that the bundled sink writes a page-made Uint8Array
// on real timers. No requestDevice: no printer here.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { createWebBluetoothSink } from '../../packages/pos/src/print/escpos/bluetooth-sink';

declare global { interface Window { TallyBluetooth: { createWebBluetoothSink: typeof createWebBluetoothSink } } }

const repoRoot = path.resolve(__dirname, '../..');
const escposDir = path.join(repoRoot, 'packages/pos/src/print/escpos');
// Every member the sink's WebBluetoothDevice type names, by the Web Bluetooth interface that declares it.
const MEMBERS: Record<string, string[]> = {
  BluetoothDevice: ['name', 'gatt'],
  BluetoothRemoteGATTServer: ['connected', 'connect', 'getPrimaryService'],
  BluetoothRemoteGATTService: ['getCharacteristic'],
  BluetoothRemoteGATTCharacteristic: ['properties', 'writeValueWithResponse', 'writeValueWithoutResponse'],
  BluetoothCharacteristicProperties: ['write', 'writeWithoutResponse'],
};
let bundle = '';

test.beforeAll(({ browserName: _browserName }, testInfo) => {
  // Resolved exactly as e2e/storage-sqlite/page/build-and-serve.mjs resolves it.
  const esbuild = createRequire(path.join(repoRoot, 'packages/storage-sqlite/package.json'))('esbuild');
  const result = esbuild.buildSync({
    entryPoints: [path.join(escposDir, 'bluetooth-sink.ts')],
    bundle: true, format: 'iife', globalName: 'TallyBluetooth', platform: 'browser', target: 'es2022', write: false,
    metafile: true, absWorkingDir: repoRoot,
  });
  // The sink is dependency-free: everything in the bundle comes from packages/pos/src.
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.filter((input) => !path.resolve(repoRoot, input).startsWith(path.join(repoRoot, 'packages/pos/src/')))).toEqual([]);
  bundle = result.outputFiles[0].text;
  writeFileSync(testInfo.outputPath('webbluetooth-sink.iife.js'), bundle);
});

async function loadBundle(page: Page) {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
}

test.describe('Web Bluetooth ESC/POS sink in Chromium', () => {
  test('the real Web Bluetooth interfaces carry every member name WebBluetoothDevice uses', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate((members) => {
      const scope = globalThis as unknown as Record<string, { prototype: object } | undefined>;
      const missing = Object.entries(members).flatMap(([name, names]) => {
        const own = scope[name] ? Object.getOwnPropertyNames(scope[name]!.prototype) : [];
        return names.filter((member) => !own.includes(member)).map((member) => `${name}.${member}`);
      });
      return { hasBluetooth: 'bluetooth' in navigator, missing };
    }, MEMBERS);
    expect(result.hasBluetooth).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test('the bundled sink writes a page-made Uint8Array in 20-byte chunks, then settles 300 ms', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      // The unit fake's preconditions: services and writes need a connected server, and each write kind its property.
      const fail = (what: string) => { throw new Error(what); };
      const [service, uuid] = ['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'];
      const writes: { response: boolean; bytes: Uint8Array; startedAt: number }[] = [];
      const properties = { write: true, writeWithoutResponse: true };
      const write = async (response: boolean, value: Uint8Array) => {
        const startedAt = performance.now();
        if (!gatt.connected) fail('NetworkError');
        if (!(response ? properties.write : properties.writeWithoutResponse)) fail('NotSupportedError');
        writes.push({ response, bytes: value.slice(), startedAt });
      };
      const characteristic = {
        properties,
        writeValueWithResponse: (value: Uint8Array<ArrayBuffer>) => write(true, value),
        writeValueWithoutResponse: (value: Uint8Array<ArrayBuffer>) => write(false, value),
      };
      const gatt = {
        connected: false,
        async connect() { gatt.connected = true; return gatt; },
        async getPrimaryService(wanted: string) {
          if (!gatt.connected) fail('NetworkError');
          if (wanted !== service) fail('NotFoundError');
          return { async getCharacteristic(name: string) { if (name !== uuid) fail('NotFoundError'); return characteristic; } };
        },
      };
      const bytes = Uint8Array.from({ length: 45 }, (_, i) => i % 251);
      await window.TallyBluetooth.createWebBluetoothSink({ device: { name: 'Page printer', gatt } }).write(bytes);
      const resolvedAt = performance.now();
      const joined = Uint8Array.from(writes.flatMap(({ bytes: part }) => [...part]));
      const equal = joined.length === bytes.length && joined.every((byte, i) => byte === bytes[i]);
      return {
        lengths: writes.map(({ bytes: part }) => part.length), responses: writes.map(({ response }) => response), equal,
        settle: resolvedAt - writes[writes.length - 1].startedAt,
      };
    });
    expect(result.lengths).toEqual([20, 20, 5]);
    expect(result.responses).toEqual([false, false, true]);
    expect(result.equal).toBe(true);
    // performance.now() is coarsened, so a 300 ms settle may measure a fraction under 300: allow 1 ms.
    expect(result.settle).toBeGreaterThanOrEqual(299);
  });
});
