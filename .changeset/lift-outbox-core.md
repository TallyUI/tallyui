---
"@tallyui/pos": minor
"@tallyui/components": minor
---

Lifted medusapos's neutral outbox core so every platform POS records and sends sales the same way (ADR-052, TV7). `@tallyui/pos` gains `getDeviceId(storage, key)`, which keeps a UUIDv7 device id in web storage under the given key and falls back to one id per process; `needsAttention(orders)`, which picks rejected and applied-with-warnings orders, newest first; and `useOrderOutbox({ storeKey, open, transport, deviceId, onBusy?, onOpenError? })`, which opens the order store for `storeKey`, runs its outbox and returns `{ orders, state, recent, record, flush, requeue }`. `@tallyui/components` gains `OrdersList`, the "Needs attention" and "Recent" orders with a Retry button, taking `orders`, `onRetry`, an optional `formatDate` (default `Intl.DateTimeFormat`) and an optional `footer`. `needsAttention` joins the pure-function allow-list components may import from `@tallyui/pos` (ADR-064).
