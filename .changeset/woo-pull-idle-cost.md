---
'@tallyui/connector-woocommerce': patch
---

The WooCommerce product pull makes one request per quiet poll in two more cases: after the most recently edited product is trashed (the store's newest product is then older than the pull's lower bound; it was 3 requests), and on a store with no products (it was 4). The stored `restarts` counter is gone: every shrink of the window restarts the pass, bounded by the per-call request budget. A stored checkpoint that still carries `restarts` keeps working.
