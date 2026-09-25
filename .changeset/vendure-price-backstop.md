---
"@tallyui/connector-vendure": minor
---

Adds a nightly price reconcile pass (`reconcile.prices`), a fingerprint backstop for tax-rate changes: a zone's rate change for a category moves every affected variant's `priceWithTax` without bumping the variant's `updatedAt`, so neither the product feed nor the variant feed re-delivers it (ADR-060).
