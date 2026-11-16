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
  /** Gap rule for scanner bursts; see WedgeSettings.gapRule. */
  gapRule?: 'folded' | 'every';
  prefix?: string;
  suffix?: string;
  minChars?: number;
  /** Which focused elements own their keys; a key there resets the burst and is never scanned.
   * 'reset' (default): INPUT and TEXTAREA. 'ignore-editable': also SELECT and contentEditable elements.
   * 'hold-money': as 'ignore-editable', but a money field (an input with inputmode="decimal") is held, not reset:
   * a scan into it never reaches the field, and other runs go in at the caret as typing. */
  fieldPolicy?: 'reset' | 'ignore-editable' | 'hold-money';
  /** Called with each accepted scan event (wedge or device) after cross-source de-duplication,
   * before onScan. */
  onScanEvent?: (event: ScanEvent) => void;
}

/** Listen for keyboard-wedge scans according to fieldPolicy, with a minimum length gate. Inside a ScanHubProvider the
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
    // 'hold-money': the money field the held keys belong to, the keys kept out of it until the run is known, whether
    // some key of the run latched, when the last one was held, and the release and yield timers.
    let field: HTMLInputElement | null = null;
    let held = '';
    let latched = false;
    let lastHeldAt = 0;
    let release: ReturnType<typeof setTimeout> | undefined;
    let yieldTimer: ReturnType<typeof setTimeout> | undefined;
    // A scan: its keys never reached the field, so they are dropped.
    const drop = () => {
      clearTimeout(release);
      clearTimeout(yieldTimer);
      held = '';
      latched = false;
      field = null;
    };
    // Typing: the held keys go in at the caret, replacing a selection, through the native setter and an input event
    // as a key would (vendurepos useWedgeScanner). drop() then clears the timers and the run.
    const flush = () => {
      if (field && held) {
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        const value = field.value.slice(0, start) + held + field.value.slice(end);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.setSelectionRange(start + held.length, start + held.length);
      }
      drop();
    };
    const detectorOptions = {
      getSettings: () => ({
        threshold: latest.current.threshold ?? DEFAULT_WEDGE_SETTINGS.threshold,
        gapRule: latest.current.gapRule,
        prefix: latest.current.prefix ?? '',
        suffix: latest.current.suffix ?? '',
      }),
      onScan: (code: string, meta: WedgeScanMeta) => {
        if (held && latched) {
          if (code.length >= (latest.current.minChars ?? DEFAULT_MIN_SCAN_CHARS)) drop();
          else flush();
        }
        if (code.length >= (latest.current.minChars ?? DEFAULT_MIN_SCAN_CHARS)) {
          // v2's toWedgeScanEvent: timed from the burst's first key, the physical scan.
          wedge$.next({ code, source: { kind: 'wedge' }, timestamp: meta.startedAtMs });
        }
      },
    };
    let detector = createWedgeDetector(detectorOptions);
    const resetDetector = () => {
      detector.dispose();
      detector = createWedgeDetector(detectorOptions);
    };
    // A printable key into a money field is held; the run decides whether it is a scan or typing.
    const holdKey = (e: KeyboardEvent, target: HTMLInputElement) => {
      const accepted = detector.handleKey(e.key);
      // A key the detector did not take starts a new run: the old run was typing (or a dropped 'every' burst).
      if (!accepted && held) flush();
      field = target;
      held += e.key;
      lastHeldAt = Date.now();
      e.preventDefault();
      clearTimeout(release);
      if (accepted) {
        // A latched run waits for the detector's settle.
        latched = true;
        e.stopPropagation();
      } else if (!latched) {
        const threshold = latest.current.threshold ?? DEFAULT_WEDGE_SETTINGS.threshold;
        // Yield once so queued keys from a stalled main thread are handled first, then flush only if none came.
        release = setTimeout(() => {
          yieldTimer = setTimeout(() => {
            if (Date.now() - lastHeldAt >= threshold) flush();
          }, 0);
        }, threshold);
      }
    };
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const policy = latest.current.fieldPolicy ?? 'reset';
      // A key not for the held field, or under another policy now: the held keys go in first.
      const stray = held !== '' && (policy !== 'hold-money' || target !== field);
      if (stray) {
        flush();
        resetDetector();
      }
      if (
        policy === 'hold-money' && !stray
        && target instanceof HTMLInputElement && target.getAttribute('inputmode') === 'decimal'
      ) {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          holdKey(e, target);
        } else if (e.key === 'Shift') {
          // A scanner sends Shift for a capital.
        } else if ((e.key === 'Enter' || e.key === 'Tab') && latched) {
          // The scanner's terminator, inside a latched run of this field.
          if (detector.handleKey(e.key)) {
            e.preventDefault();
            e.stopPropagation();
          }
        } else {
          // Named keys and shortcuts act on what the field shows, so the held keys go in before their default action.
          flush();
          resetDetector();
        }
        return;
      }
      const tagName = target?.tagName;
      if (
        tagName === 'INPUT' || tagName === 'TEXTAREA'
        || (policy !== 'reset' && (tagName === 'SELECT' || target?.isContentEditable === true))
      ) {
        resetDetector();
      } else if (detector.handleKey(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // v2 uses keydown because keyup gave lowercase.
    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      // Typing is never lost.
      flush();
      window.removeEventListener('keydown', handler, { capture: true });
      detector.dispose();
      subscription.unsubscribe();
    };
  }, [enabled, hub]);
}
