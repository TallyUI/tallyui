---
"@tallyui/pos": minor
---

Add the tender reducer, ported from WCPOS `next` at test parity: an integer-minor-unit keypad, cash change, quick tender amounts, and even/fixed/percentage/item split plans. `tenderReducer`, `initTenderState`, `initialTenderState`, `appliedMinor`, `changeMinor`, `quickTenderedAmounts`, `evenSplitShareMinor`, `activePlan`, `planLegs` and `MAX_TENDER_MINOR` are exported from `@tallyui/pos`, along with their state and action types. WCPOS's WooCommerce-only legacy tab (`TenderTab`, the `tab` field, `set-tab`) is dropped as platform-specific; `PaymentTransport` is redefined locally as the same hardware transport union. No screens: those come with the TV6 components lift and the app.
