# TallyUI Vendure connector

## Errors

Requests with expired or rejected credentials reject with `ConnectorUnauthorizedError`, defined in `@tallyui/core` and re-exported by this connector. `error.status` is `401` (`code: 'unauthorized'`, sign in again) or `403` (`code: 'forbidden'`, signed in but not allowed: the pull retries on the store schedule; don't sign out); a signed-out Vendure session is always `401`.

Sign-in itself rejects with `SignInError`.

## Signing in

Vendure supports two credential kinds: email and password (`kind: 'password'`), which `signIn` exchanges for a bearer session `token`, and a device key (`kind: 'api-key'`, stored as `api_key`), a Vendure API key available in Vendure 3.6+.

Render `vendureAuth.fieldSets.password` or `vendureAuth.fieldSets['api-key']` (also exported as `vendureAuthFieldSets`) and store `kind` with the credentials. `vendureAuth.fields` remains the email and password form. Each kind sends only its chosen credential; when `kind` is absent, `api_key` wins over a session token as before.

`capabilities()` works with a device key and no sign-in. Signing out a device-key till forgets the key on the device; it does not revoke the key on the server. The store owner revokes the key in Vendure.

## Customers

`searchCustomers`, `createCustomer` and `getCustomer` are online only and run in the session's channel, selected by the `vendure-token` header.

The till's administrator needs `ReadCustomer` to search and look up customers, and `CreateCustomer` to create them. Without these permissions, the calls reject with `ConnectorUnauthorizedError` status `403`.

A duplicate email rejects with `CustomerServiceError` code `invalid`. The vendurepos walk-in customer is left out of search results.

Vendure's `CreateCustomerInput` requires `firstName` and `lastName`; leaving them out fails GraphQL input validation (recorded on Vendure 3.7.3). So `createCustomer` with only an email sends both as `''`, which Vendure 3.7.3 accepts: it creates the customer with empty names, and the till shows its email as the name.
