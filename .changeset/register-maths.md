---
"@tallyui/pos": minor
---

Adds `@tallyui/pos`'s register maths (`packages/pos/src/register`), ported from WCPOS `next` at `3b5331b5c` (ADR-032, registers job a1): typed-movement validation against the server's paid-in/paid-out/no-sale grammar (`movementFieldError`, `normalizeAmount`, `isServerDecimal`), the register count's variance, threshold, denomination and amount maths (`countVariance`, `overThreshold`, `denominationTotal`, `varianceText`, `validAmount`, `parseMinor`, `denominations`), and `deriveExpected` for the float, captured session payments and non-voided paid-in/paid-out cash movements. Refund attribution is deferred until TallyUI has a refund model, so `deriveExpected` does not yet net refunds against the drawer. All money is TallyUI's integer-minor-units convention, with a required `exponent` parameter wherever a cashier's typed text becomes minor units (0 for JPY, 2 for GBP, 3 for KWD).
