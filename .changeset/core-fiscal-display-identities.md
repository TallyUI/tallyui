---
'@tallyui/core': minor
---

Order payloads whose display figures do not add up (ADR-063 I1–I3) are now refused as invalid_payload.

A store that takes this version refuses such a payload from any till, including one an older till still holds in its outbox. The check runs on version 3 and later payloads that carry `display` and `taxByRate` and pass the shape check; a version 3 or 4 payload that fails the shape check is not checked here. A command the store has already applied still replays as `duplicate`. The oldest `@tallyui/pos` proven to satisfy I1–I3 is 3.20.1: 200 seeded sales built by each of 3.20.1, 4.0.0, 4.1.0 and 4.2.0 pass the new check (both tax modes, line and order discounts, coupons, fees and shipping). 3.10.0 and 3.3.0 could not be run, and the other versions were not run. The run does not build return lines, reopened orders or charges with `amountIncludesTax`, and those versions have no cash rounding. On Woo with prices including tax it leaves out fees and shipping (#1341), and an order discount with a coupon (#1342): a check that predates this change can already refuse those sales.
