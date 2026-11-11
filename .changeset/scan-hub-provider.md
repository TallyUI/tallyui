---
'@tallyui/pos': minor
---

`ScanHubProvider` keeps the Web Serial and WebHID scanner connections alive across screens and exposes them through `useScanHub` and `useDeviceScanControls`, and `useBarcodeScanner` now merges those device scans with keyboard-wedge scans, dropping cross-source duplicates with `scanTimeOf` and reporting each through the new `onScanEvent` option (#682).
