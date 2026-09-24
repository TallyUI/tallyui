---
"@tallyui/core": minor
"@tallyui/connector-medusa": patch
"@tallyui/connector-vendure": patch
---

A fresh install downloads the catalogue once. A pull adapter can now declare `pull.seedCheckpoint`; on a fresh install (no stored checkpoint) `combinePullAdapters` reads every seed before any feed runs and starts that feed from it. The Medusa and Vendure variant feeds seed their cursor at the newest variant's `updated_at`, so their first pass no longer re-delivers every product the product feed has just delivered, and a variant edit made during the product feed's first pass still arrives. An install upgrading from a stored checkpoint is never seeded and keeps the variant feed's full healing pass.
