---
'@tallyui/connector-vendure': patch
'@tallyui/database': patch
'@tallyui/storage-sqlite': patch
'@tallyui/pos': patch
---

Internal tidy: the Vendure price fingerprint builds each variant's entry in one place, order history reuses its one tally-fields option, `REQUIRED_MULTI_INSTANCE_BY_ENGINE` keys on `WEB_STORAGE_ENGINE`, and stale planning and version comments are corrected. Behaviour unchanged.
