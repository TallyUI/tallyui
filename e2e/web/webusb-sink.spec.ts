// Real-browser proof for the WebUSB ESC/POS sink (packages/pos/src/print/escpos/usb-sink.ts). The unit tests' fake
// stands in for a USBDevice; this proves in Chromium that the real WebUSB interfaces carry every member name the sink's
// `WebUsbDevice` type uses, and that the bundled sink writes a page-made Uint8Array. No requestDevice: no printer here.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { createWebUsbSink } from '../../packages/pos/src/print/escpos/usb-sink';

declare global { interface Window { TallyUsb: { createWebUsbSink: typeof createWebUsbSink } } }

const repoRoot = path.resolve(__dirname, '../..');
const escposDir = path.join(repoRoot, 'packages/pos/src/print/escpos');
// Every member the sink's WebUsbDevice type names, by the WebUSB interface that declares it.
const MEMBERS: Record<string, string[]> = {
  USBDevice: ['opened', 'configuration', 'productName', 'open', 'selectConfiguration', 'claimInterface', 'clearHalt', 'transferOut'],
  USBConfiguration: ['interfaces'],
  USBInterface: ['interfaceNumber', 'claimed', 'alternate'],
  USBAlternateInterface: ['interfaceClass', 'endpoints'],
  USBEndpoint: ['endpointNumber', 'direction', 'type'],
};
let bundle = '';

test.beforeAll(({ browserName: _browserName }, testInfo) => {
  // Resolved exactly as e2e/storage-sqlite/page/build-and-serve.mjs resolves it.
  const esbuild = createRequire(path.join(repoRoot, 'packages/storage-sqlite/package.json'))('esbuild');
  const result = esbuild.buildSync({
    entryPoints: [path.join(escposDir, 'usb-sink.ts')],
    bundle: true, format: 'iife', globalName: 'TallyUsb', platform: 'browser', target: 'es2022', write: false,
    metafile: true, absWorkingDir: repoRoot,
  });
  // The sink is dependency-free: everything in the bundle comes from packages/pos/src.
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.filter((input) => !path.resolve(repoRoot, input).startsWith(path.join(repoRoot, 'packages/pos/src/')))).toEqual([]);
  bundle = result.outputFiles[0].text;
  writeFileSync(testInfo.outputPath('webusb-sink.iife.js'), bundle);
});

async function loadBundle(page: Page) {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
}

test.describe('WebUSB ESC/POS sink in Chromium', () => {
  test('the real WebUSB interfaces carry every member name WebUsbDevice uses', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async (members) => {
      const scope = globalThis as unknown as Record<string, { prototype: object } | undefined>;
      const missing = Object.entries(members).flatMap(([name, names]) => {
        const own = scope[name] ? Object.getOwnPropertyNames(scope[name]!.prototype) : [];
        return names.filter((member) => !own.includes(member)).map((member) => `${name}.${member}`);
      });
      const usb = (navigator as unknown as { usb: { getDevices(): Promise<unknown[]> } }).usb;
      const devices = await usb.getDevices();
      return { hasUsb: 'usb' in navigator, missing, devices: { isArray: Array.isArray(devices), length: devices.length } };
    }, MEMBERS);
    console.log(`navigator.usb.getDevices() resolved to ${JSON.stringify(result.devices)}`);
    expect(result.hasUsb).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.devices.isArray).toBe(true);
  });

  test('the bundled sink writes a page-made Uint8Array in 4096-byte transfers', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      // The unit fake's preconditions: configure and claim only when open, transfer only when claimed.
      const fail = () => { throw new Error('InvalidStateError'); };
      const transfers: Uint8Array[] = [];
      const endpoints = [{ endpointNumber: 1, direction: 'in', type: 'bulk' }, { endpointNumber: 2, direction: 'out', type: 'bulk' }] as const;
      const usbInterface = { interfaceNumber: 0, claimed: false, alternate: { endpoints } };
      const configuration = { interfaces: [usbInterface] };
      const device = {
        productName: 'Page printer', opened: false, configuration: null as typeof configuration | null,
        async open() { device.opened = true; },
        async selectConfiguration() { if (!device.opened) fail(); device.configuration = configuration; },
        async claimInterface() { if (!device.opened || !device.configuration) fail(); usbInterface.claimed = true; },
        async clearHalt() {},
        async transferOut(endpointNumber: number, data: Uint8Array) {
          if (!device.opened || !usbInterface.claimed || endpointNumber !== 2) fail();
          transfers.push(data.slice());
          return { status: 'ok' as const, bytesWritten: data.length };
        },
      };
      const bytes = Uint8Array.from({ length: 5000 }, (_, i) => i % 251);
      await window.TallyUsb.createWebUsbSink({ device }).write(bytes);
      const joined = Uint8Array.from(transfers.flatMap((part) => [...part]));
      const equal = joined.length === bytes.length && joined.every((byte, i) => byte === bytes[i]);
      return { lengths: transfers.map((part) => part.length), equal };
    });
    expect(result.lengths).toEqual([4096, 904]);
    expect(result.equal).toBe(true);
  });
});
