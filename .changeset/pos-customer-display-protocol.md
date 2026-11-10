---
"@tallyui/pos": minor
---

Add the customer display protocol: a versioned message envelope with `encodeDisplayMessage` and a `decodeDisplayMessage` that refuses anything it cannot trust, the five display actions, a cart snapshot over `ReceiptData` kept under 200 KiB, and a `displayReducer` for the idle, cart and payment screens.
