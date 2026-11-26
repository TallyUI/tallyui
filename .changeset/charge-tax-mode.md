---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-vendure': minor
---

A fee or shipping charge entered in a mode other than the store's is sent in its own mode (`amountIncludesTax`), but only to a store whose connector declares `chargeTaxMode`. connector-vendure maps `/tally/v1/info`'s `chargeTaxMode: { v: 1 }`.

This ends the one-cent drift of an inclusive fee in a tax-exclusive Vendure store. Without the capability, nothing changes.

- **Apps:** nothing to do beyond passing the connector's capabilities to `finalizeOrder`, as before. The WooCommerce and Medusa connectors need no change.
- **Servers built on `@tallyui/core/server`:** a server whose connector declares the capability must pass `supported.chargeTaxMode: true` to `precheckCommand`. Otherwise it refuses every sale that carries `amountIncludesTax` with `invalid_payload`.
- **Storage is one-way.** `pos_orders` moves to schema version 23, an identity migration: no stored order is rewritten, and v23 only adds the optional `entered` on fee and shipping items. Once a till has opened this version, an older build opens the store but shows none of its orders, as with versions 21 and 22. The sales it rings meanwhile are migrated in when the till opens at 23 again. Never roll an app back across this version.
