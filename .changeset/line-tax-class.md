---
'@tallyui/core': minor
'@tallyui/pos': patch
'@tallyui/connector-vendure': patch
---

Each line is taxed at its product's tax class, not the store's default (#288). `ProductTraits` gains an optional `getTaxClass(doc, variantId?)`, the backend's tax class id, a key of `StoreSettings.taxRatesPpm`. `addProduct` and `addEntryToCart` pass it to `addLine` through the new `AddLineInput.taxClass`, which the tax context resolves; a connector without the accessor is unchanged (the default rate). `TaxProvider` taxes a class with no rate at the default rate and warns once per class through the new `taxLogger`. connector-vendure replicates each variant's `taxCategory { id }` and implements the accessor, and its store settings give every tax category with no enabled rate in the default zone an explicit 0 rate, as Vendure charges; its product schema goes to version 2, so the products collection is dropped and downloaded again on the first sync after the upgrade.
