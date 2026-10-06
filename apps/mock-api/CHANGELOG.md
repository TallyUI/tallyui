# @tallyui/mock-api

## 3.6.0

## 3.5.3

## 3.5.2

## 3.5.1

## 3.5.0

## 3.4.0

## 3.3.0

## 3.2.1

## 3.2.0

## 3.1.1

## 3.1.0

## 3.0.4

## 3.0.3

## 3.0.2

## 3.0.1

## 3.0.0

## 3.0.0-next.2

## 3.0.0-next.1

## 3.0.0-next.0

## 2.0.0

### Patch Changes

- [#45](https://github.com/TallyUI/tallyui/pull/45) [`14620d9`](https://github.com/TallyUI/tallyui/commit/14620d9ee5853f61ad5b638acd57f0236e6bcb8f) Thanks [@kilbot](https://github.com/kilbot)! - Fix Vendure product pagination with fixed timestamp windows and ID ordering. Add an opt-in barcode field and stock-location configuration, use available stock from stockLevels, and support the Admin API in the mock.

  Complete pull passes using totalItems, restart empty mid-pass pages, and use a pass-start high-water mark with idle detection to preserve updates in RxDB replication. Include GraphQL error messages on failed HTTP responses. Existing users must set barcodeField to read barcodes: getBarcode now returns undefined unless barcodeField is configured.

  Guard each pull pass against skewed Vendure updatedAt filters and add updatedAtSkewMs to widen lower bounds when the server cannot run with TZ=UTC.
