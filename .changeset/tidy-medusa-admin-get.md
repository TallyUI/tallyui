---
'@tallyui/connector-medusa': patch
---

Internal tidy: the Admin API reads in the product and variant feeds and the id, price and stock reconcilers share one GET helper, and the price fingerprint builds its base-price entries in one place. Behaviour unchanged.
