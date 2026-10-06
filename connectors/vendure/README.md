# TallyUI Vendure connector

## Errors

Requests with expired or rejected credentials reject with `ConnectorUnauthorizedError`, defined in `@tallyui/core` and re-exported by this connector. `error.status` is `401` (`code: 'unauthorized'`, sign in again) or `403` (`code: 'forbidden'`, signed in but not allowed: the pull retries on the store schedule; don't sign out); a signed-out Vendure session is always `401`.

Sign-in itself rejects with `SignInError`.

## Customers

`searchCustomers`, `createCustomer` and `getCustomer` are online only and run in the session's channel, selected by the `vendure-token` header.

The till's administrator needs `ReadCustomer` to search and look up customers, and `CreateCustomer` to create them. Without these permissions, the calls reject with `ConnectorUnauthorizedError` status `403`.

A duplicate email rejects with `CustomerServiceError` code `invalid`. The vendurepos walk-in customer is left out of search results.

Vendure's `CreateCustomerInput` requires `firstName` and `lastName`; leaving them out fails GraphQL input validation (recorded on Vendure 3.7.3). So `createCustomer` with only an email sends both as `''`, which Vendure 3.7.3 accepts: it creates the customer with empty names, and the till shows its email as the name.
