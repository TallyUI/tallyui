import { useMemo, useRef, useState } from 'react';
import { useScanHub } from './scan-hub-context';
import { createScanSession } from './scan-session';
import { DEFAULT_MIN_SCAN_CHARS } from './wedge-detector';

export interface UseCameraScanOptions {
  /** Drop decodes while false (v2: the POS section is not active). Default true. */
  active?: boolean;
  /** Codes shorter than this are refused and reported to onTooShort. Default DEFAULT_MIN_SCAN_CHARS. */
  minChars?: number;
  onTooShort?: (code: string) => void;
  now?: () => number;
}

/** offer: feed one decode; it goes through a continuous scan session and is emitted to the hub as a camera event.
 * reset: clear the cooldowns (call when the scanner opens). Inside a ScanHubProvider the app's useBarcodeScanner
 * receives the events; with no provider the hub is inert and they go nowhere.
 * Ported from WCPOS v2 packages/core/src/screens/main/pos/products/use-camera-scan.ts. */
export function useCameraScan(options: UseCameraScanOptions = {}): { offer(code: string, symbology?: string): void; reset(): void } {
  const latest = useRef(options);
  latest.current = options;
  const hub = useScanHub();
  const hubRef = useRef(hub);
  hubRef.current = hub;
  // One session for the hook's lifetime, so a changing option never drops the cooldowns.
  const [session] = useState(() => createScanSession({
    continuous: true,
    now: () => (latest.current.now ?? Date.now)(),
    onAccept: (code, symbology) => {
      hubRef.current.emit({ code, symbology, source: { kind: 'camera' }, timestamp: (latest.current.now ?? Date.now)() });
    },
  }));
  return useMemo(() => ({
    offer: (code: string, symbology?: string) => {
      const { active = true, minChars = DEFAULT_MIN_SCAN_CHARS, onTooShort } = latest.current;
      if (!active) return;
      // Before the session, so a too-short read never starts a cooldown.
      if (code.length < minChars) {
        onTooShort?.(code);
        return;
      }
      session.offer(code, symbology);
    },
    reset: () => session.reset(),
  }), [session]);
}
