import { useEffect, useRef } from 'react';
import { createWedgeDetector, DEFAULT_MIN_SCAN_CHARS, DEFAULT_WEDGE_SETTINGS } from './wedge-detector';

export interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  /** Listen only while true (default true). */
  enabled?: boolean;
  threshold?: number;
  prefix?: string;
  suffix?: string;
  minChars?: number;
}

/** Listen for keyboard-wedge scans outside INPUT/TEXTAREA, with a minimum length gate.
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
  useEffect(() => {
    if (!enabled) return;
    const detectorOptions = {
      getSettings: () => ({
        threshold: latest.current.threshold ?? DEFAULT_WEDGE_SETTINGS.threshold,
        prefix: latest.current.prefix ?? '',
        suffix: latest.current.suffix ?? '',
      }),
      onScan: (code: string) => {
        if (code.length >= (latest.current.minChars ?? DEFAULT_MIN_SCAN_CHARS)) {
          latest.current.onScan(code);
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
    };
  }, [enabled]);
}
