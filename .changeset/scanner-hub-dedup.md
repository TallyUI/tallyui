---
'@tallyui/pos': minor
---

The scanner adds a scan hub that merges input sources (`createScanHub`, `createScanBus`, `inertScanHub`), a `dedupeScans` operator that drops one physical scan reaching the POS through two source kinds within `SCAN_DEDUP_WINDOW_MS`, and a second `onScan` argument on the wedge detector, `WedgeScanMeta` (`terminated`, `startedAtMs`).
