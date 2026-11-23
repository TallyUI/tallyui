---
"@tallyui/pos": minor
"@tallyui/components": patch
---

The sales report and the Z carry a sale's cash rounding (ADR-094) as its own figure, so net, tax and rounding add up to gross. `SalesTotals` gains a required `roundingMinor`, and `netMinor` is now gross less tax less rounding, the pre-tax amount the product rows add up to; `ReportOrder` gains an optional `roundingMinor`, set by `reportOrderFromPosOrder`. `writeClosure` records a session's rounding as `breakdowns.cash_rounding_minor` (only when non-zero; `closures` stays at schema version 0), and `buildClosureDocument` shows it as `closure.cash_rounding` (`name`, `amount`, `amount_display`) with `has_cash_rounding`, labelled by the new `cash_rounding` label key ("Rounding"). The Taxes card and the taxes panel show a Rounding line when the period has one.
