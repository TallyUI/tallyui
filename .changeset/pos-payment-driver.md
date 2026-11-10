---
'@tallyui/pos': minor
---

POS now describes a card reader or payment terminal through a backend-neutral `PaymentDriver` interface, with a registry that finds a payment method's driver by its `capture.provider`. A deterministic simulated driver, with injectable timers, approves, declines, cancels and times out on cue for tests and demos.
