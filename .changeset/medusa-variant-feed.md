---
"@tallyui/connector-medusa": minor
---

Medusa's `replication.products` now includes a variant feed, so price edits arrive incrementally. Medusa 2.21 bumps a variant's `updated_at` on a price-only edit but not its product's, so the product feed alone missed those changes. The variant feed pages changed variants and re-delivers their parent products. The first sync after upgrading re-delivers every product once.
