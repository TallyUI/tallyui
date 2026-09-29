---
'@tallyui/connector-woocommerce': patch
---

The product pull no longer skips products that share a `date_modified_gmt` second across a page boundary. It pulls in passes, like the Medusa connector: each pass fixes an inclusive lower bound (`modified_after` one second earlier), pages that window by product id with an offset, restarts if `X-WP-Total` shrinks mid-pass, and moves the lower bound to the newest `date_modified_gmt` in the store when the pass began. When nothing has changed since the last pass, the pull makes one small request and returns nothing. `WooProductCheckpoint` is now `{ modified, offset, pass_mark?, pass_count? }`; a stored `{ id, modified }` checkpoint is read as the start of a pass.
