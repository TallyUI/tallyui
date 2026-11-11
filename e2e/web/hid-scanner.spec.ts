// Real-browser proof for the WebHID scanner controller (packages/pos/src/scanner/hid-scanner.ts). The unit tests'
// fakes stand in for navigator.hid and the input report's DataView; this proves in Chromium what they stand in for:
// the real navigator.hid without a user gesture, and a page-made DataView fed through the decoder.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { createHidScanner } from '../../packages/pos/src/scanner/hid-scanner';
import type { isChooserCancel } from '../../packages/pos/src/scanner/chooser-cancel';

interface TallyHidBundle { createHidScanner: typeof createHidScanner; isChooserCancel: typeof isChooserCancel }
declare global {
  interface Window { TallyHid: TallyHidBundle }
}

const repoRoot = path.resolve(__dirname, '../..');
const scannerDir = path.join(repoRoot, 'packages/pos/src/scanner');
// A HID-POS report as hid-pos-decoder.test.ts builds it: [length, ...ASCII '4006381333931', 0x0a (ean13)].
const EAN13_REPORT = [13, ...[...'4006381333931'].map((char) => char.charCodeAt(0)), 0x0a];
let bundle = '';

test.beforeAll(({ browserName: _browserName }, testInfo) => {
  // Resolved exactly as e2e/storage-sqlite/page/build-and-serve.mjs resolves it.
  const esbuild = createRequire(path.join(repoRoot, 'packages/storage-sqlite/package.json'))('esbuild');
  const result = esbuild.buildSync({
    stdin: {
      contents: "export { createHidScanner } from './hid-scanner';\nexport { isChooserCancel } from './chooser-cancel';\n",
      resolveDir: scannerDir, loader: 'ts', sourcefile: 'hid-scanner-entry.ts',
    },
    bundle: true, format: 'iife', globalName: 'TallyHid', platform: 'browser', target: 'es2022', write: false,
    metafile: true,
  });
  // The controller files may import RxDB's types only, never RxDB itself.
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.filter((input) => /(^|\/)rxdb(\/|$)/.test(input))).toEqual([]);
  bundle = result.outputFiles[0].text;
  writeFileSync(testInfo.outputPath('hid-scanner.iife.js'), bundle);
});

async function loadBundle(page: Page) {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
}

type HidOption = Parameters<TallyHidBundle['createHidScanner']>[0]['hid'];

test.describe('WebHID scanner controller in Chromium', () => {
  test('is available, and reopenSaved resolves with an empty store and no error', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      const hid = (navigator as unknown as { hid: HidOption }).hid;
      const errors: string[] = [];
      const scanner = window.TallyHid.createHidScanner({
        hid, profiles: { read: async () => [], save: async () => undefined },
        getSettings: () => ({ prefix: '', suffix: '', minChars: 3 }), emit: () => undefined,
        onError: (error) => { errors.push(String(error)); },
      });
      const devices = await hid!.getDevices();
      await scanner.reopenSaved();
      return {
        hasHid: 'hid' in navigator, available: scanner.available, errors, state: scanner.getState(),
        devices: { isArray: Array.isArray(devices), length: devices.length },
      };
    });
    console.log(`navigator.hid.getDevices() resolved to ${JSON.stringify(result.devices)}`);
    expect(result.hasHid).toBe(true);
    expect(result.available).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.state).toEqual({ connected: false, connectedDeviceKey: null });
  });

  test('connect without a user gesture resolves, and any error carries the chooser-cancel flag', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      const { createHidScanner, isChooserCancel } = window.TallyHid;
      const realHid = (navigator as unknown as { hid: NonNullable<HidOption> }).hid;
      // Records what the real requestDevice resolved to; the call itself is navigator.hid's, unchanged.
      let resolved: { isArray: boolean; length: number } | null = null;
      const hid: HidOption = {
        requestDevice: async (options) => {
          const devices = await realHid.requestDevice(options);
          resolved = { isArray: Array.isArray(devices), length: devices.length };
          return devices;
        },
        getDevices: () => realHid.getDevices(),
      };
      const calls: { name: string; message: string; phase: string; cancelled: boolean; isCancel: boolean }[] = [];
      const scanner = createHidScanner({
        hid, profiles: { read: async () => [], save: async () => undefined },
        getSettings: () => ({ prefix: '', suffix: '', minChars: 3 }), emit: () => undefined,
        onError: (error, info) => {
          const { name, message } = error as Error;
          calls.push({ name, message, phase: info.phase, cancelled: info.cancelled, isCancel: isChooserCancel(error) });
        },
      });
      let rejected = false;
      await scanner.connect().catch(() => { rejected = true; });
      return { rejected, calls, resolved, state: scanner.getState() };
    });
    expect(result.rejected).toBe(false);
    console.log(`connect() without a gesture: onError called=${result.calls.length > 0}, requestDevice resolved to ${JSON.stringify(result.resolved)}`);
    for (const call of result.calls) {
      console.log(`connect() without a gesture: error.name=${JSON.stringify(call.name)} error.message=${JSON.stringify(call.message)}`);
      expect(call.phase).toBe('connect');
      expect(call.cancelled).toBe(call.isCancel);
    }
    expect(result.calls.length).toBeLessThanOrEqual(1);
    expect(result.state).toEqual({ connected: false, connectedDeviceKey: null });
  });

  test('decodes a real page DataView, then removes the listener before closing on disconnect', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async (reportBytes) => {
      const log: string[] = [];
      let listener: ((event: { data: DataView; reportId: number }) => void) | null = null;
      const device = {
        vendorId: 1234, productId: 5678, productName: 'Page scanner',
        open: async () => { log.push('open'); }, close: async () => { log.push('close'); },
        addEventListener: (_type: 'inputreport', next: (event: { data: DataView; reportId: number }) => void) => {
          log.push('add');
          listener = next;
        },
        removeEventListener: (_type: 'inputreport', next: (event: { data: DataView; reportId: number }) => void) => {
          log.push('remove');
          if (listener === next) listener = null;
        },
      };
      const codes: { code: string; symbology?: string }[] = [];
      const scanner = window.TallyHid.createHidScanner({
        hid: { requestDevice: async () => [device], getDevices: async () => [] },
        profiles: { read: async () => [], save: async () => undefined },
        getSettings: () => ({ prefix: '', suffix: '', minChars: 1 }),
        emit: (event) => { codes.push({ code: event.code, symbology: event.symbology }); },
      });
      await scanner.connect();
      const held = listener as ((event: { data: DataView; reportId: number }) => void) | null;
      held?.({ data: new DataView(new Uint8Array(reportBytes).buffer), reportId: 0 });
      const connectedState = scanner.getState();
      await scanner.disconnect();
      return { codes, log, listenerCleared: listener === null, connectedState, state: scanner.getState() };
    }, EAN13_REPORT);
    expect(result.codes).toEqual([{ code: '4006381333931', symbology: 'ean13' }]);
    expect(result.connectedState).toEqual({ connected: true, connectedDeviceKey: 'hid-pos:1234:5678' });
    expect(result.log).toEqual(['open', 'add', 'remove', 'close']);
    expect(result.listenerCleared).toBe(true);
    expect(result.state).toEqual({ connected: false, connectedDeviceKey: null });
  });
});
