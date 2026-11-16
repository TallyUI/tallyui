---
'@tallyui/core': patch
---

Internal tidy: `precheckCommand` builds its rejections through one helper, core uses `OrderCreatePayload` internally (the deprecated `OrderCreatePayloadV3` alias stays exported), and the order.create version docs now list version 6. Behaviour unchanged.
