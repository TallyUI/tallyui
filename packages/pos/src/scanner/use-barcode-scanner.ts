import { useEffect, useRef } from 'react';
import { merge, Subject } from 'rxjs';
import { dedupeScans, SCAN_DEDUP_WINDOW_MS, scanTimeOf } from './scan-dedup';
import type { ScanEvent } from './scan-events';
import { useScanHub } from './scan-hub-context';
import { createWedgeDetector, DEFAULT_MIN_SCAN_CHARS, DEFAULT_WEDGE_SETTINGS, type WedgeScanMeta } from './wedge-detector';

export interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  /** Listen only while true (default true). */
  enabled?: boolean;
  threshold?: number;
  prefix?: string;
  suffix?: string;
  minChars?: number;
  /** Called with each accepted scan event (wedge or device) after cross-source de-duplication,
   * before onScan. */
  onScanEvent?: (event: ScanEvent) => void;
}

/** Listen for keyboard-wedge scans outside INPUT/TEXTAREA, with a minimum length gate. Inside a ScanHubProvider the
 * hub's device scans (serial, HID-POS) join them, and a copy of one physical scan from a second source is dropped.
 * Ported from WCPOS v2 packages/core/src/screens/main/hooks/barcodes/use-barcode-detection.ts (monorepo 5ac185b0).
 * @example
 * useBarcodeScanner({ onScan: (code) => {
 *   const twin = retailCodeTwin(code);
 *   const entry = findEntryByCode(entries, code)
 *     ?? (twin ? entries.find(({ variant }) => variant.barcode === twin) : undefined);
 *   if (entry) addEntryToCart(builder, entry, traits, currency);
 *   else setSearchTerm(code); // searchProducts returns just the exact barcode/SKU matches
 * } });
 */
export function useBarcodeScanner(options: UseBarcodeScannerOptions): void {
  const latest = useRef(options);
  latest.current = options;
  const enabled = options.enabled ?? true;
  const hub = useScanHub();
  useEffect(() => {
    if (!enabled) return;
    const wedge$ = new Subject<ScanEvent>();
    const subscription = merge(wedge$, hub.events$)
      .pipe(dedupeScans(SCAN_DEDUP_WINDOW_MS, scanTimeOf))
      .subscribe((event) => {
        latest.current.onScanEvent?.(event);
        latest.current.onScan(event.code);
      });
    const detectorOptions = {
      getSettings: () => ({
        threshold: latest.current.threshold ?? DEFAULT_WEDGE_SETTINGS.threshold,
        prefix: latest.current.prefix ?? '',
        suffix: latest.current.suffix ?? '',
      }),
      onScan: (code: string, meta: WedgeScanMeta) => {
        if (code.length >= (latest.current.minChars ?? DEFAULT_MIN_SCAN_CHARS)) {
          // v2's toWedgeScanEvent: timed from the burst's first key, the physical scan.
          wedge$.next({ code, source: { kind: 'wedge' }, timestamp: meta.startedAtMs });
        }
      },
    };
    let detector = createWedgeDetector(detectorOptions);
    const handler = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement | null)?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
        detector.dispose();
        detector = createWedgeDetector(detectorOptions);
      } else if (detector.handleKey(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // v2 uses keydown because keyup gave lowercase.
    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.removeEventListener('keydown', handler, { capture: true });
      detector.dispose();
      subscription.unsubscribe();
    };
  }, [enabled, hub]);
}
