---
'@tallyui/core': minor
'@tallyui/pos': patch
'@tallyui/components': patch
---

The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.
