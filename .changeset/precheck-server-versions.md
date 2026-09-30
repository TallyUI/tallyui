---
'@tallyui/core': minor
---

`precheckCommand` now takes the server's own supported versions as a required second argument, `{ orderCreate, register }`, and checks against them; its `unsupported_version` message and `data` name the server's list, not core's (#297). Plugins must pass their supported versions: `precheckCommand(envelope, { orderCreate: [1, 2, 3], register: [1] })`. `SUPPORTED_ORDER_CREATE_VERSIONS` and `SUPPORTED_REGISTER_VERSIONS` stay exported as the till's capability (what `toOrderCreateEnvelope` can produce), not what a server supports.
