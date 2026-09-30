---
'@tallyui/core': major
---

Breaking: `precheckCommand` now takes the server's own supported versions as a required second argument, `{ orderCreate, register }`, and checks against them; its `unsupported_version` message and `data` name the server's list, not core's (#297). Plugins MUST pass their supported versions: `precheckCommand(envelope, { orderCreate: [1, 2, 3], register: [1] })`; an empty list throws a `TypeError`. This is part of 3.0.0's breaking changes and adds no extra major. `SUPPORTED_ORDER_CREATE_VERSIONS` and `SUPPORTED_REGISTER_VERSIONS` stay exported as the till's capability (what `toOrderCreateEnvelope` can produce), not what a server supports.
