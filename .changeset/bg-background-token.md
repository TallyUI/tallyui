---
'@tallyui/components': patch
---

POSLayout, CheckoutLayout, SettingsLayout, LiveTabScreen and StoreSettingsChoiceScreen now draw the theme's background (bg-background); they used bg-bg, a class with no token, so they drew none.
