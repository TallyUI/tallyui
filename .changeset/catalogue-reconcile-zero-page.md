---
"@tallyui/database": patch
"@tallyui/connector-woocommerce": patch
---

A catalogue reconcile pass that lists no page now skips the deletion check, so it no longer raises a false "kept on this till" message every hour (#376). The WooCommerce catalogue check now restarts in full after its listing fails on a fresh pass, instead of resuming and skipping deletions for a day (#376).
