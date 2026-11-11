// Real-browser proof for the Web Serial scanner controller (packages/pos/src/scanner/serial-scanner.ts). The unit
// tests' fakes stand in for navigator.serial and the port's ReadableStream; this proves in Chromium what they stand in
// for: the real navigator.serial without a user gesture, and a real stream's reader cancel and lock release.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { createSerialScanner } from '../../packages/pos/src/scanner/serial-scanner';
import type { isChooserCancel } from '../../packages/pos/src/scanner/chooser-cancel';

interface TallySerialBundle { createSerialScanner: typeof createSerialScanner; isChooserCancel: typeof isChooserCancel }
declare global {
  interface Window { TallySerial: TallySerialBundle }
}

const repoRoot = path.resolve(__dirname, '../..');
const scannerDir = path.join(repoRoot, 'packages/pos/src/scanner');
let bundle = '';

test.beforeAll(({ browserName: _browserName }, testInfo) => {
  // Resolved exactly as e2e/storage-sqlite/page/build-and-serve.mjs resolves it.
  const esbuild = createRequire(path.join(repoRoot, 'packages/storage-sqlite/package.json'))('esbuild');
  const result = esbuild.buildSync({
    stdin: {
      contents: "export { createSerialScanner } from './serial-scanner';\nexport { isChooserCancel } from './chooser-cancel';\n",
      resolveDir: scannerDir, loader: 'ts', sourcefile: 'serial-scanner-entry.ts',
    },
    bundle: true, format: 'iife', globalName: 'TallySerial', platform: 'browser', target: 'es2022', write: false,
    metafile: true,
  });
  // The controller files may import RxDB's types only, never RxDB itself.
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.filter((input) => /(^|\/)rxdb(\/|$)/.test(input))).toEqual([]);
  bundle = result.outputFiles[0].text;
  writeFileSync(testInfo.outputPath('serial-scanner.iife.js'), bundle);
});

async function loadBundle(page: Page) {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
}

test.describe('Web Serial scanner controller in Chromium', () => {
  test('is available, and reopenSaved resolves with an empty store and no error', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      const serial = (navigator as unknown as { serial: Parameters<TallySerialBundle['createSerialScanner']>[0]['serial'] }).serial;
      const errors: string[] = [];
      const scanner = window.TallySerial.createSerialScanner({
        serial, profiles: { read: async () => [], save: async () => undefined },
        getSettings: () => ({ prefix: '', suffix: '', minChars: 3 }), emit: () => undefined,
        onError: (error) => { errors.push(String(error)); },
      });
      const ports = await serial!.getPorts();
      await scanner.reopenSaved();
      return {
        hasSerial: 'serial' in navigator, available: scanner.available, errors, state: scanner.getState(),
        ports: { isArray: Array.isArray(ports), length: ports.length },
      };
    });
    console.log(`navigator.serial.getPorts() resolved to ${JSON.stringify(result.ports)}`);
    expect(result.hasSerial).toBe(true);
    expect(result.available).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.state).toEqual({ connected: false, connectedDeviceKey: null });
  });

  test('connect without a user gesture resolves and reports the error once', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      const { createSerialScanner, isChooserCancel } = window.TallySerial;
      const serial = (navigator as unknown as { serial: Parameters<typeof createSerialScanner>[0]['serial'] }).serial;
      const calls: { name: string; message: string; phase: string; cancelled: boolean; isCancel: boolean }[] = [];
      const scanner = createSerialScanner({
        serial, profiles: { read: async () => [], save: async () => undefined },
        getSettings: () => ({ prefix: '', suffix: '', minChars: 3 }), emit: () => undefined,
        onError: (error, info) => {
          const { name, message } = error as Error;
          calls.push({ name, message, phase: info.phase, cancelled: info.cancelled, isCancel: isChooserCancel(error) });
        },
      });
      let rejected = false;
      await scanner.connect().catch(() => { rejected = true; });
      return { rejected, calls, state: scanner.getState() };
    });
    expect(result.rejected).toBe(false);
    expect(result.calls).toHaveLength(1);
    const [call] = result.calls;
    console.log(`connect() without a gesture: error.name=${JSON.stringify(call.name)} error.message=${JSON.stringify(call.message)}`);
    expect(call.phase).toBe('connect');
    expect(call.cancelled).toBe(call.isCancel);
    expect(result.state).toEqual({ connected: false, connectedDeviceKey: null });
  });

  test('frames a real page stream, then cancels the pending read before closing on disconnect', async ({ page }) => {
    await loadBundle(page);
    const result = await page.evaluate(async () => {
      const log: string[] = [];
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
      const getReader = stream.getReader.bind(stream);
      (stream as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }).getReader = () => {
        const reader = getReader();
        const cancel = reader.cancel.bind(reader);
        reader.cancel = (reason?: unknown) => { log.push('cancel'); return cancel(reason); };
        return reader;
      };
      const port = {
        open: async () => { log.push('open'); }, close: async () => { log.push('close'); }, readable: stream,
        getInfo: () => ({ usbVendorId: 1234, usbProductId: 5678 }),
      };
      const codes: string[] = [];
      const scanner = window.TallySerial.createSerialScanner({
        serial: { requestPort: async () => port, getPorts: async () => [] },
        profiles: { read: async () => [], save: async () => undefined },
        getSettings: () => ({ prefix: '', suffix: '', minChars: 1 }), emit: (event) => { codes.push(event.code); },
      });
      await scanner.connect();
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('12345'));
      controller.enqueue(encoder.encode('678\r\n'));
      controller.enqueue(new Uint8Array([0x41, 0xc3]));
      controller.enqueue(new Uint8Array([0xa9, 0x42, 0x0d]));
      for (let waited = 0; codes.length < 2 && waited < 2000; waited += 20) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const lockedWhileReading = stream.locked;
      const outcome = await Promise.race([
        scanner.disconnect().then(() => 'resolved'),
        new Promise((resolve) => setTimeout(() => resolve('timed out'), 2000)),
      ]);
      return { codes, log, lockedWhileReading, locked: stream.locked, outcome, state: scanner.getState() };
    });
    expect(result.codes).toEqual(['12345678', 'AéB']);
    expect(result.lockedWhileReading).toBe(true);
    expect(result.outcome).toBe('resolved');
    expect(result.log).toEqual(['open', 'cancel', 'close']);
    expect(result.locked).toBe(false);
    expect(result.state).toEqual({ connected: false, connectedDeviceKey: null });
  });
});
