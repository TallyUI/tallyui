---
"@tallyui/components": patch
---

`OrdersList` shows the store's order history next to the till's own sales (ADR-052 amendment 1). It takes an optional `history` of platform-neutral rows (`OrderHistoryRow`: `id`, `clientOrderId?`, `reference`, `placedAt`, `totalMinor`, `currency`, `itemCount`, `stateLabel`), which the app maps from its own store.

- A history row whose `clientOrderId` matches an outbox order is hidden while that order is in `orders`.
- Recent merges the two lists, newest first.
- A history row is read-only: it has no detail, no Retry, and never appears under Needs attention.

Without `history`, `OrdersList` renders exactly as before.
