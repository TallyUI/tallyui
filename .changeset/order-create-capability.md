---
"@tallyui/core": minor
"@tallyui/connector-medusa": minor
"@tallyui/pos": minor
---

A per-store `order.create` capability check replaces the global discount guard (ADR-062). `@tallyui/core` gains `ServerCapabilities`, `SignInResult.capabilities`, `SyncContext.capabilities`, `TallyConnector.capabilities?()` and `resolveCapabilities(fresh, stored)`. `@tallyui/connector-medusa` reads the store's supported `order.create` versions from `GET /tally/v1/info`: a 404 or a malformed response means an old plugin (version 1), a network failure or a 5xx is unknown and keeps the last known value, and a 401 throws. `medusaSignIn` returns the read capabilities, and both Medusa connectors expose `capabilities(context)` for a restored session. `finalizeOrder` in `@tallyui/pos` now rejects a discount only when the store's capability is below 2, so a store whose plugin has caught up finalizes a discounted order as `order.create` version 2.
