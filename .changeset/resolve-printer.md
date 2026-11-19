---
'@tallyui/pos': minor
---

New `resolvePrinter`, which picks the printer profile for a receipt template: the cashier's pick for this print, else the device's per-template override, else the first printer that fits the template by paper (the default printer first). Ported from WCPOS v2. Also `templateColumns`, the column counts a thermal template's paper fits.
