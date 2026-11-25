---
'@tallyui/components': minor
---

`Cart` takes `taxDisplay`: `'itemized'` (the default, one tax row per rate, as before) or `'single'`, one Total Tax row with the order's total tax, tagged Including or Excluding tax and drawn only when that tax is not 0, as WCPOS v2 does when the store shows its tax as one total. `taxLabel` now gets a second argument, `{ code, ratePpm }`, so a platform can name two rates with the same percentage apart by their tax code; a one-argument `taxLabel` keeps working and the default label is unchanged. Receipts, `CartTotal` and every order figure are unchanged.
