---
'@tallyui/connector-woocommerce': patch
---

Read WCPOS 1.10.x product uuids from the `_woocommerce_pos_uuid` meta and barcodes from `global_unique_id` when the top-level fields are absent, so the connector syncs from the released WCPOS Free plugin (1.10.20).
