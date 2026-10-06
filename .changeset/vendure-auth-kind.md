---
'@tallyui/connector-vendure': minor
---

`vendureAuth` gains `fieldSets` (email and password, or a device key) and honours an optional credential `kind: 'password' | 'api-key'`, so a SignIn screen can offer a device key without its own form; credentials without `kind` behave as before.
