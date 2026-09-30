---
'@tallyui/connector-woocommerce': patch
---

Only WCPOS's own protocol gate counts as "this till needs updating" (#302):
- **The plugin's gate:** a 426 whose body carries `code: "wcpos_update_required"` still raises `WooTillUpdateRequiredError`.
- **Any other 426** (from a proxy or another plugin, or with no or another body) is now a transient error, retried with backoff, so it never tells a cashier to update the till.

The built connector now bundles only its version from `package.json`, not the whole file.
