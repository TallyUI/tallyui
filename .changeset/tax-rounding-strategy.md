---
'@tallyui/core': minor
'@tallyui/pos': minor
---

The till computes tax with the store's rounding strategy (#287, ADR-071). `ServerCapabilities` gains `taxRounding` (core exports `TaxRounding`): `per_order`, `per_line` or `per_rate_group`, each with `half_away_from_zero` or `half_up`, or `custom`. Absent, and `custom`, mean today's `per_order` with half away from zero. `TaxProvider` takes `rounding` and `rateCodes` (tax class → the backend's rate name, for `per_rate_group`); the order records the strategy as `taxRounding`, and `taxLinesByRate` takes it as a fourth argument. The algorithms are in `docs/contract/field-kinds.md`.
