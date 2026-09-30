---
'@tallyui/connector-vendure': patch
---

A GraphQL `FORBIDDEN` answer throws `ConnectorUnauthorizedError` only when a probe (`{ activeAdministrator { id } }`, same headers) finds nobody signed in (#274). With a live administrator it is a plain `Error` naming the missing permission, and a failed probe is a plain, transient `Error`, so a missing permission no longer signs the till out into a sign-in loop.
