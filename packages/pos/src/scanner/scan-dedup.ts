// Ported from WCPOS v2 packages/scanner/src/scan-dedup.ts (monorepo 85ecbd43f).
import { defer, type MonoTypeOperatorFunction, type Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

import type { ScanEvent, ScanSourceKind } from './scan-events';

/** One physical scan can reach the POS through two sources: the keyboard wedge
 * AND a direct HID-POS or serial connection to the same dongle. The 500 ms
 * window is measured from the physical scan, independent of code length or
 * scanner speed. Only a repeat from a DIFFERENT source is dropped: the same
 * source repeating a code is a real second scan (two identical items), and each
 * source's own handling decides those. */
export const SCAN_DEDUP_WINDOW_MS = 500;

// A scanner sending UPC-A as EAN-13 reports `0` plus 12 digits through the wedge, while
// scan-session's normalizeRetailCode reports the bare 12 — the same printed code.
const dedupKey = (code: string) => (/^0\d{12}$/.test(code) ? code.slice(1) : code);

export function dedupeScans(
  windowMs = SCAN_DEDUP_WINDOW_MS,
  scanTime: (event: ScanEvent) => number = () => Date.now(),
): MonoTypeOperatorFunction<ScanEvent> {
  return (source$: Observable<ScanEvent>) =>
    defer(() => {
      const lastPassed = new Map<string, { t: number; kind: ScanSourceKind }>();
      return source$.pipe(
        filter((event) => {
          const t = scanTime(event);
          for (const [code, passed] of lastPassed) {
            if (Math.abs(t - passed.t) >= windowMs) lastPassed.delete(code);
          }
          const key = dedupKey(event.code);
          const prev = lastPassed.get(key);
          const crossSource = prev !== undefined && prev.kind !== event.source.kind;
          if (crossSource && Math.abs(t - prev.t) < windowMs) return false;
          lastPassed.set(key, { t, kind: event.source.kind });
          return true;
        }),
      );
    });
}

/** A wedge copy is timed from its burst's first key (the physical scan); every other source is
 * timed at receipt, because sources stamp on different clocks. Pass it to dedupeScans.
 * Ported from WCPOS v2 use-barcode-detection.ts (monorepo 85ecbd43f, #2263). */
export function scanTimeOf(event: ScanEvent): number {
  return event.source.kind === 'wedge' ? event.timestamp : Date.now();
}
