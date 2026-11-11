import { type Observable, Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';

import { dedupeScans, SCAN_DEDUP_WINDOW_MS } from './scan-dedup';
import { scanTimeOf } from './scan-dedup';

import type { ScanEvent } from './scan-events';

const scan: ScanEvent = { code: '12345678', source: { kind: 'wedge' }, timestamp: 1 };
const deviceScan: ScanEvent = { ...scan, source: { kind: 'hid-pos' } };

describe('dedupeScans', () => {
  let receiptTime: number;
  let source$: Subject<ScanEvent>;
  let scans$: Observable<ScanEvent>;
  let received: ScanEvent[];

  beforeEach(() => {
    receiptTime = 0;
    source$ = new Subject<ScanEvent>();
    scans$ = source$.pipe(dedupeScans(undefined, (_event) => receiptTime));
    received = [];
    scans$.subscribe((event) => received.push(event));
  });

  it('passes the same code only once across different source kinds within the window', () => {
    source$.next(scan);
    receiptTime = 151;
    source$.next({ ...scan, source: { kind: 'hid-pos' }, timestamp: 10000 });
    receiptTime = 300;
    source$.next({ ...scan, source: { kind: 'serial' }, timestamp: -10000 });

    expect(received).toEqual([scan]);
  });

  it('passes the same code again after the window', () => {
    source$.next(scan);
    receiptTime = SCAN_DEDUP_WINDOW_MS + 1;
    source$.next(scan);

    expect(received).toEqual([scan, scan]);
  });

  it('de-duplicates padded UPC-A codes without changing the emitted code', () => {
    const padded = { ...scan, code: '0123456789012' };
    source$.next(padded);
    receiptTime = 151;
    source$.next({ ...deviceScan, code: '123456789012' });

    expect(received).toEqual([padded]);
  });

  it('drops a scan timed 40 ms before the previous pass', () => {
    source$.next(scan);
    receiptTime = -40;
    source$.next(deviceScan);

    expect(received).toEqual([scan]);
  });

  it('passes a scan timed more than the window before the previous pass', () => {
    source$.next(scan);
    receiptTime = -SCAN_DEDUP_WINDOW_MS - 1;
    source$.next(deviceScan);

    expect(received).toEqual([scan, deviceScan]);
  });

  it('does not extend the window when a duplicate is dropped', () => {
    source$.next(scan);
    receiptTime = SCAN_DEDUP_WINDOW_MS - 1;
    source$.next(deviceScan);
    expect(received).toEqual([scan]);
    receiptTime = SCAN_DEDUP_WINDOW_MS;
    source$.next(deviceScan);

    expect(received).toEqual([scan, deviceScan]);
  });

  it('passes different codes within the window', () => {
    const otherScan = { ...scan, code: '22222222' };
    source$.next(scan);
    receiptTime = 1;
    source$.next(otherScan);

    expect(received).toEqual([scan, otherScan]);
  });

  it('gives each subscriber independent state', () => {
    const secondReceived: ScanEvent[] = [];
    scans$.subscribe((event) => secondReceived.push(event));
    source$.next(scan);
    receiptTime = 1;
    source$.next(deviceScan);

    expect(received).toEqual([scan]);
    expect(secondReceived).toEqual([scan]);
  });

  it('passes a same-kind repeat of the same code within the window', () => {
    source$.next(scan);
    receiptTime = 300;
    source$.next(scan);

    expect(received).toEqual([scan, scan]);
  });

  it('collapses a cross-kind copy against the latest same-kind repeat', () => {
    source$.next(scan);
    receiptTime = 300;
    source$.next(scan);
    receiptTime = 550;
    source$.next(deviceScan);

    expect(received).toEqual([scan, scan]);
  });

  it('passes the same code once when hid-pos comes before wedge within the window', () => {
    source$.next(deviceScan);
    receiptTime = 151;
    source$.next(scan);

    expect(received).toEqual([deviceScan]);
  });

  // Not in v2: two direct sources, neither of them the wedge.
  it('passes the same code once when hid-pos follows serial within the window', () => {
    const serialScan: ScanEvent = { ...scan, source: { kind: 'serial' } };
    source$.next(serialScan);
    receiptTime = 100;
    source$.next(deviceScan);

    expect(received).toEqual([serialScan]);
  });
});

describe('scanTimeOf', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('times a wedge copy from its burst start and every other source at receipt', () => {
    expect(scanTimeOf({ ...scan, timestamp: 1234 })).toBe(1234);
    expect(scanTimeOf({ ...scan, source: { kind: 'serial' }, timestamp: 1234 })).toBe(10_000);
  });

  // v2 #2263: the wedge emits WEDGE_END_OF_SCAN_MS after its LAST key, so on a long code its receipt lands outside
  // the window although the physical scan was the same.
  it('drops a wedge copy received 700 ms after a serial scan whose burst started 100 ms after it', () => {
    const serialScan: ScanEvent = { ...scan, source: { kind: 'serial' }, timestamp: 0 };
    const wedgeCopy: ScanEvent = { ...scan, timestamp: 10_100 };
    const run = (scanTime?: (event: ScanEvent) => number) => {
      vi.setSystemTime(10_000);
      const source$ = new Subject<ScanEvent>();
      const received: ScanEvent[] = [];
      source$.pipe(dedupeScans(SCAN_DEDUP_WINDOW_MS, scanTime)).subscribe((event) => received.push(event));
      source$.next(serialScan);
      vi.setSystemTime(10_700);
      source$.next(wedgeCopy);
      return received;
    };

    expect(run(scanTimeOf)).toEqual([serialScan]);
    expect(run()).toEqual([serialScan, wedgeCopy]);
  });
});
