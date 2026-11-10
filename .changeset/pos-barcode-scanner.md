---
"@tallyui/pos": minor
---

Add keyboard-wedge barcode scanning: `useBarcodeScanner` tells a scanner's fast burst of keys from a person typing and calls `onScan` with the code, along with retail barcode helpers ported from WCPOS v2 (UPC-A/EAN-13 leading-zero handling, check digits and a repeat-scan cooldown).
