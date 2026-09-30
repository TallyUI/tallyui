---
'@tallyui/core': minor
'@tallyui/database': patch
'@tallyui/components': minor
'@tallyui/connector-woocommerce': patch
'@tallyui/connector-medusa': patch
'@tallyui/connector-vendure': patch
---

A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

- **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
  - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
  - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
  - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
- **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
- **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.
