---
"@tallyui/components": patch
---

`CartPanel` rows now default to keying by the item's `id` (string or number), falling back to index only for items without one, instead of always keying by index — so removing a line above another with an open inline form (e.g. a per-line discount editor) no longer remounts and loses that form's state. Pass `keyExtractor` to override.
