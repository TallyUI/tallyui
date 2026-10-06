---
'@tallyui/connector-woocommerce': patch
---

Variable products carry their variations, read from WCPOS 1.10.x's flat wcpos/v2/variations route (no per-product route exists there), so getVariants returns them (titled from their attribute options). The products collection schema goes to version 1, so the catalogue resyncs once.
