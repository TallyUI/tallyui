---
'@tallyui/connector-woocommerce': minor
---

A `jwt_auth_*` 403 is now `WooTokenRefusedError` (`store_misconfigured`, `fixedBy: 'store'`, with a `fix`), replacing `WooPluginUpdateRequiredError` (#360). The old error told the store owner to update to WCPOS 1.10.8, but the same 403 also arrives on 1.10.8 and later, so the new one names no version: "The store refused the sign-in token (403). Ask the store owner to check the JWT Authentication plugin's settings, or pair the till again." `SyncStatus` shows "a setting on the online store needs changing" with the fix. **Breaking for importers:** `WooPluginUpdateRequiredError` is no longer exported.
