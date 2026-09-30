---
'@tallyui/core': patch
'@tallyui/connector-vendure': patch
'@tallyui/connector-woocommerce': patch
'@tallyui/components': patch
---

Follow-ups to the 401/403 split (#345):

- **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
- **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`, a bad token) is a 401, so the till asks for a sign-in instead of showing "not allowed".
- **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
- **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.
