---
'@tallyui/pos': patch
'@tallyui/components': patch
'@tallyui/connector-woocommerce': patch
---

catalogueEntries accepts a trait context and no longer requires getVariants (a product without it sells as one variant from its own traits); Catalogue passes its currency; connector-woocommerce adds getVariants for non-variable products (variable products need their variations synced, a later release).
