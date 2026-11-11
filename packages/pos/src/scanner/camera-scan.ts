// Ported from WCPOS v2 packages/core/src/screens/main/pos/products (scanner-viewfinder.web.tsx, decode-loop.ts).
/** The symbologies a camera scanner looks for, in TallyUI's (and expo-camera's) names. */
export const CAMERA_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] as const;
/** The same symbologies in BarcodeDetector's format names. */
export const DETECTOR_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] as const;

const DETECTOR_TO_SYMBOLOGY: Record<string, string> = {
  ean_13: 'ean13', ean_8: 'ean8', upc_a: 'upc_a', upc_e: 'upc_e', code_128: 'code128', qr_code: 'qr',
};

/** BarcodeDetector format → TallyUI symbology (v2 WEB_TO_EXPO_TYPE). Unknown formats map to undefined. */
export function detectorFormatToSymbology(format: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(DETECTOR_TO_SYMBOLOGY, format) ? DETECTOR_TO_SYMBOLOGY[format] : undefined;
}

export interface DetectedBarcode { rawValue: string; format: string }
/** The structural part of BarcodeDetector the loop uses (the native API and v2's ponyfill both fit). */
export interface CameraDecoder { detect(source: unknown): Promise<DetectedBarcode[]> }

type DetectorClass = new (options: { formats: string[] }) => CameraDecoder;

/** The browser's BarcodeDetector for DETECTOR_FORMATS, or undefined when the global is missing. Never throws. */
export function nativeBarcodeDetector(): CameraDecoder | undefined {
  try {
    const Detector = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (typeof Detector !== 'function') return undefined;
    const detector = new Detector({ formats: [...DETECTOR_FORMATS] });
    return { detect: (source) => detector.detect(source) };
  } catch {
    return undefined;
  }
}

export type ViewfinderStatus = 'initializing' | 'scanning' | 'camera-denied' | 'camera-unavailable' | 'decoder-error';
export const DEFAULT_DECODE_INTERVAL_MS = 200;
/** Consecutive decoder rejections before the scanner reports 'decoder-error'. */
export const DECODER_ERROR_THRESHOLD = 5;

export interface DecodeLoopOptions {
  decoder: CameraDecoder;
  /** The <video> element on web. */
  source: unknown;
  onDetected: (code: string, symbology?: string) => void;
  onStatus: (status: 'scanning' | 'decoder-error') => void;
  intervalMs?: number;
  /** Default setTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  /** Default clearTimeout. */
  clearTimer?: (handle: unknown) => void;
}

/** Decode every intervalMs: one detect in flight at a time; each result goes to onDetected; DECODER_ERROR_THRESHOLD
 * consecutive rejections report 'decoder-error'; any success clears the count and reports 'scanning' again. stop()
 * ends it, and no callback fires after stop. */
export function startDecodeLoop(options: DecodeLoopOptions): { stop(): void } {
  const intervalMs = options.intervalMs ?? DEFAULT_DECODE_INTERVAL_MS;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const clearTimer = options.clearTimer
    ?? ((handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  let stopped = false;
  let handle: unknown;
  let failures = 0;
  let failing = false;

  const schedule = () => {
    if (!stopped) handle = setTimer(tick, intervalMs);
  };
  // The next detect is scheduled only once this one settles, so a slow decoder never has two in flight.
  function tick() {
    handle = undefined;
    Promise.resolve()
      .then(() => options.decoder.detect(options.source))
      .then((results) => {
        if (stopped) return;
        failures = 0;
        if (failing) {
          failing = false;
          options.onStatus('scanning');
        }
        for (const { rawValue, format } of results) {
          if (stopped) return;
          if (rawValue) options.onDetected(rawValue, detectorFormatToSymbology(format));
        }
      }, () => {
        if (stopped) return;
        failures += 1;
        if (failures === DECODER_ERROR_THRESHOLD) {
          failing = true;
          options.onStatus('decoder-error');
        }
      })
      .finally(schedule);
  }

  schedule();
  return {
    stop: () => {
      stopped = true;
      if (handle !== undefined) clearTimer(handle);
      handle = undefined;
    },
  };
}

/** getUserMedia error → status: NotAllowedError → 'camera-denied', anything else → 'camera-unavailable'. */
export function cameraErrorStatus(error: unknown): 'camera-denied' | 'camera-unavailable' {
  return (error as { name?: unknown } | null)?.name === 'NotAllowedError' ? 'camera-denied' : 'camera-unavailable';
}

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};
