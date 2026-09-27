---
"@tallyui/components": minor
---

`Catalogue` takes an optional `minCodeLength` prop (a till's barcode-scanner setting). When set, Enter on a search query shorter than `minCodeLength` (after trimming) no longer does a barcode/SKU lookup — it leaves the typed text as a plain search instead of selecting an entry. Unset, behaviour is unchanged. A scanner's timing threshold stays the app's own concern, in its unfocused wedge listener.
