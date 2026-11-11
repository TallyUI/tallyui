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

export interface CameraScan {
  offer(code: string, symbology?: string): void;
  reset(): void;
  /** Codes accepted and emitted so far; the app passes it to CameraScannerPanel, which flashes on each change. */
  scanCount: number;
}

/** offer: feed one decode; it goes through a continuous scan session and is emitted to the hub as a camera event.
 * reset: clear the cooldowns (call when the scanner opens). Inside a ScanHubProvider the app's useBarcodeScanner
 * receives the events; with no provider the hub is inert and they go nowhere. The app owns this hook and passes
 * { onDetected: offer, onOpen: reset, scanCount } to CameraScannerPanel.
 * Ported from WCPOS v2 packages/core/src/screens/main/pos/products/use-camera-scan.ts. */
export function useCameraScan(options: UseCameraScanOptions = {}): CameraScan {
  const latest = useRef(options);
  latest.current = options;
  const hub = useScanHub();
  const hubRef = useRef(hub);
  hubRef.current = hub;
  const [scanCount, setScanCount] = useState(0);
  // One session for the hook's lifetime, so a changing option never drops the cooldowns.
  const [session] = useState(() => createScanSession({
    continuous: true,
    now: () => (latest.current.now ?? Date.now)(),
    onAccept: (code, symbology) => {
      hubRef.current.emit({ code, symbology, source: { kind: 'camera' }, timestamp: (latest.current.now ?? Date.now)() });
      setScanCount((count) => count + 1);
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
    scanCount,
  }), [session, scanCount]);
}
