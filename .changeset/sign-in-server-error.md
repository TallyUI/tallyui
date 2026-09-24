---
"@tallyui/core": minor
"@tallyui/connector-medusa": minor
"@tallyui/connector-vendure": minor
---

`SignInErrorCode` splits the old `failed` in two: `failed` now means no response arrived (a network error), and the new `server_error` means a response arrived but was unusable (a bad status, a malformed body, or a missing token). `SignInError` gains an optional `status` from a third constructor argument. Callers that switch on `code` should handle `server_error`.

Medusa's sign-in now treats `mfa_required: true` and `verification_required: true` the same as a `location` body: `unsupported`, and no token is ever returned from a body like that. A malformed response body, any other non-OK status and a missing or non-string token are now `server_error` with the HTTP status.

Vendure's sign-in now treats `NATIVE_AUTH_STRATEGY_ERROR` as `unsupported`, since native email/password auth is disabled on the server. A malformed response body, a non-OK status, GraphQL errors, a missing `data.login` and any other `ErrorResult` are now `server_error` with the HTTP status.
