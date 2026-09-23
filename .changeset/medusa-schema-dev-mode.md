---
"@tallyui/connector-medusa": patch
---

Make the Medusa product schema load under RxDB dev-mode (indexed `handle` and `status` are now required with a `maxLength`), keep pulled documents to the schema's fields so new Medusa API fields never fail validation, and page each replication pass in `id` order, since many products share an `updated_at`.
