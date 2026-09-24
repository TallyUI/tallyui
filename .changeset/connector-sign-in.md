---
"@tallyui/core": minor
"@tallyui/connector-vendure": minor
"@tallyui/connector-medusa": minor
---

Connectors can sign a user in: `ConnectorAuth` gains an optional `signIn(baseUrl, { email, password }, init?)` that resolves to a `SignInResult` (`token`, optional ISO 8601 `expiresAt`) and rejects with a `SignInError` whose `code` is `invalid_credentials`, `unsupported` or `failed`. The app stores the token and passes it back to `getHeaders` as `token`.

Vendure's auth gains a sign-in flow: it runs the Admin API `login` mutation and takes the token from the `vendure-auth-token` header (the server's `tokenMethod` must include `'bearer'`). Its fields are now `url`, `email`, `password` and an optional `channel_token`. `getHeaders` sends `credentials.api_key` as `vendure-api-key`, otherwise `credentials.token` as a Bearer token, plus `vendure-token` when `channel_token` is set. The old `auth_token` credential is still accepted as a deprecated alias for `token`.

Medusa's `medusaAdminUserAuth` signs in through `POST /auth/user/emailpass` and reads `expiresAt` from the JWT's `exp`. `medusaSecretKeyAuth` has no sign-in.
