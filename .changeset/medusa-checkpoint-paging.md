---
"@tallyui/connector-medusa": patch
---

Fix product replication skipping a page of products per batch: the checkpoint now keeps its `updated_at` filter fixed while paging and only advances it at the end of a pass.
