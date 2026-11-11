---
'@tallyui/pos': minor
---

Add WCPOS v2's receipt-data vocabulary. `wcposReceiptData(source, store, options)` turns a sale in minor units into WCPOS's canonical receipt data (money in major units, the `_incl`/`_excl` twins, savings, the tax summary, fiscal and register blocks), and `formatWcposReceiptData(data)` adds the `*_display` strings, tax-ID labels and the merged `i18n` that WCPOS templates print. `formatWcposMoney`, `WCPOS_DEFAULT_I18N` and `WCPOS_TAX_ID_LABELS` are exported too.
