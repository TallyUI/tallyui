---
'@tallyui/core': minor
---

Order payloads whose display figures do not add up (ADR-063 I1–I3) are now refused as invalid_payload.

A store that takes this version refuses such a payload from any till, including one an older till still holds in its outbox. The oldest `@tallyui/pos` proven to satisfy I1–I3 is 3.20.1: 200 seeded sales built by each of 3.20.1, 4.0.0, 4.1.0 and 4.2.0 pass the new check (both tax modes, line and order discounts, coupons, fees and shipping). Versions between and before these were not run. The run does not build return lines, reopened orders or charges with `amountIncludesTax`, and those versions have no cash rounding. On Woo with prices including tax it leaves out fees and shipping (#1341), and an order discount with a coupon (#1342): a check that predates this change can already refuse those sales.
