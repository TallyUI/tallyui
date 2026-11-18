# Settings › Barcode scanning: the Scanning section (R6)

TallyUI demo `/pos/barcode-scanning-settings` (apps/demo: `BarcodeScanningSettings` with its values in local state,
starting at v2's defaults 24 / 8 / '' / '', and a muted line under the section printing the saved values),
Playwright Chromium, 1280x800, JPEG quality 70, light and dark (`colorScheme`).

- `tallyui-defaults-light.jpg`, `tallyui-defaults-dark.jpg`: the "Scanning" group at v2's defaults: Barcode Average
  Time Input Threshold (ms) 24, Barcode Minimum Length 8, empty prefix and suffix; the saved line reads
  `threshold 24 ms · minimum length 8 · prefix "" · suffix ""`.
- `tallyui-min-length-12-light.jpg`, `tallyui-min-length-12-dark.jpg`: after typing `1a2` into Barcode Minimum Length
  (the field focused): the `a` is dropped, the field shows `12` and the saved line reads `minimum length 12`.

No page errors in the run.

## v2

`docs/v2-parity/screens/v2/settings-barcode.jpg` is v2's Settings › Barcode Scanning; its first section, Scanning, is
the one ported here, with the same four rows, labels and defaults. v2's Sound, Scanner and Barcode Scanning Test
sections are not part of this component.
