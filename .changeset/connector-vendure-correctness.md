---
"@tallyui/connector-vendure": minor
"@tallyui/mock-api": patch
---

Fix Vendure product pagination with fixed timestamp windows and ID ordering. Add an opt-in barcode field and stock-location configuration, use available stock from stockLevels, and support the Admin API in the mock.

Complete pull passes using totalItems, restart empty mid-pass pages, and use a pass-start high-water mark with idle detection to preserve updates in RxDB replication. Include GraphQL error messages on failed HTTP responses. Existing users must set barcodeField to read barcodes: getBarcode now returns undefined unless barcodeField is configured.

Guard each pull pass against skewed Vendure updatedAt filters and add updatedAtSkewMs to widen lower bounds when the server cannot run with TZ=UTC.
