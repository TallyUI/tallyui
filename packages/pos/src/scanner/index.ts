export { DEFAULT_WEDGE_SETTINGS, DEFAULT_MIN_SCAN_CHARS, WEDGE_END_OF_SCAN_MS, createWedgeState, foldWedgeKey, stripBoundary, replayWedgeDetector, createWedgeDetector } from './wedge-detector';
export type { WedgeSettings, WedgeState, TraceKey, WedgeReplayResult, WedgeDetectorOptions, WedgeDetector } from './wedge-detector';
export { DEFAULT_COOLDOWN_MS, normalizeRetailCode, hasValidRetailCheckDigit, retailCodeTwin, createScanSession } from './scan-session';
export type { ScanRejectReason, ScanOfferResult, ScanSessionOptions, ScanSession } from './scan-session';
export { useBarcodeScanner } from './use-barcode-scanner';
export type { UseBarcodeScannerOptions } from './use-barcode-scanner';
