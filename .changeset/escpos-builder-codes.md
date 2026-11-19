---
'@tallyui/pos': minor
---

`escpos()` gains `underline`, `invert`, `barcode` (CODE128 and EAN13) and `qrcode`, with the new `EscPosBarcodeOptions` and `EscPosQrOptions` types. `barcode` and `qrcode` throw a `RangeError` before writing anything when a value cannot be encoded. Existing commands and `encodeEscPos` output are unchanged.
