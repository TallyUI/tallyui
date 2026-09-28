# TallyUI Medusa connector

## Errors

Requests with expired or rejected credentials reject with `ConnectorUnauthorizedError` (`code: 'unauthorized'`), defined in `@tallyui/core` and re-exported by this connector. The app should sign in again.

Sign-in itself rejects with `SignInError`.
