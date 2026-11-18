# Register close: RegisterCount keypad-first (R3a)

TallyUI demo `/pos/register/count` (apps/demo: a counting session expecting €200.00 cash, `onPrint` wired to a
demo line), Playwright Chromium, 1280x800, JPEG quality 70, light and dark (`colorScheme`).

- `tallyui-first-load-light.jpg`, `tallyui-first-load-dark.jpg`: first load: the amount with its keypad open, "Count by
  notes and coins" closed, Close reading "Close & print" (disabled until an amount is entered).
- `tallyui-keys-200-collapsed-light.jpg`, `tallyui-keys-200-collapsed-dark.jpg`: after `2`, `0`, `0` on the keypad and
  Tab out of the entry: the keypad has folded away, "Tap the amount to edit it" shows, the variance reads Exact.
- `tallyui-notes-and-coins-open-light.jpg`, `tallyui-notes-and-coins-open-dark.jpg`: "Count by notes and coins" open,
  two €50 tiles tapped: the amount reads 100.00 and the tile tap has folded the keypad.

No page errors in the run.

## v2

`docs/v2-parity/screens/v2/register-close.jpg` is v2's register close. This PR ports its keypad-first amount, the
"Count by notes and coins" fold and the "Close & print" label. Its count note, "Other tenders" fold and Expected /
Short / Over result band are later PRs.
