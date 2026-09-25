---
"@tallyui/connector-vendure": minor
---

Fixes three Vendure stock gaps (backlog 28, from the #45 stock review): a variant with `trackInventory` `FALSE`, or `INHERIT` with the global setting off, is now always in stock; `outOfStockThreshold` (per variant, or the global one through `useGlobalOutOfStockThreshold`) is now subtracted from available stock, matching Vendure's own saleable rule; `getStockStatus` and `getStockQuantity` now aggregate every variant, as `getStock` already did, instead of reading variant 0 only.

Adds `vendureGlobalStockSettings(context)` for the channel's stock defaults, and `createVendureConnector` options `globalTrackInventory` and `globalOutOfStockThreshold`.

The Vendure product schema is now version 1, declaring `variants[].trackInventory`, `outOfStockThreshold`, `useGlobalOutOfStockThreshold` and `enabled`. **The first sync after upgrading resyncs the Vendure catalogue once**: a schema version bump drops the stored products and downloads them again (ADR-060 amendment 9). A collection created with `vendureProductSchema` outside `createTallyDatabase` must use `connectorCollection(vendureProductSchema)` from `@tallyui/database`.
