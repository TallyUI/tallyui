---
"@tallyui/connector-medusa": minor
---

Add a Bearer credential type for Medusa admin users: `medusaAdminUserAuth` sends the JWT from emailpass sign-in as `Authorization: Bearer <jwt>`, and `medusaAdminUserConnector` is `medusaConnector` with that auth. The secret-key auth is now also exported as `medusaSecretKeyAuth`; `medusaConnector` is unchanged.
