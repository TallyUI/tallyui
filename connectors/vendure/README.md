# TallyUI Vendure connector

## Errors

Requests with expired or rejected credentials reject with `ConnectorUnauthorizedError`, defined in `@tallyui/core` and re-exported by this connector. `error.status` is `401` (`code: 'unauthorized'`, sign in again) or `403` (`code: 'forbidden'`, signed in but not allowed: the pull retries on the store schedule; don't sign out); a signed-out Vendure session is always `401`.

Sign-in itself rejects with `SignInError`.
