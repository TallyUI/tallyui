---
'@tallyui/components': minor
---

`CartFoot` takes `note?: { text, onPress }` and `Cart` takes `checkout.note`, drawing WCPOS v2's note row above the Checkout button. It is hidden when the note is empty, quiet at rest, and on hover or focus washes and shows an edit glyph (always shown on a coarse pointer). It is 36 px high with a 44 px touch target, and pressing it calls `onPress` so the app opens its note editor.
