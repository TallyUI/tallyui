---
'@tallyui/pos': minor
'@tallyui/components': minor
---

The sale shows how its tax was worked out. `@tallyui/pos` adds `taxDerivation(settings, location)`, a pure function that explains the sale's tax rates: the "tax based on" setting, the address it used (and any fallback, such as shipping to billing), and each tax class with its effective rate (compound rates included) and the rates that matched, with the reason for each match (postcode, city, state, country or anywhere). When nothing matches, it says why: the order has no address, or the store has no rate for this country or address. `SaleTaxLocation` types the sale's `taxLocation`.

`@tallyui/components` adds `TaxBasedOn`, the "Tax based on" trigger and popover that shows that derivation in three steps (setting, address, rates), with optional "Change in Settings › Tax" and "View all tax rates" links. It also adds `TaxCalculationSettings`, the Settings › Tax "Calculation" group with a "Calculate tax based on" select and read-only rows for prices entered with tax, the shipping tax class and rounding at subtotal, which are set in WooCommerce.
